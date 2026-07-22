package com.tu.backend.storage;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.BusinessException;
import com.tu.backend.storage.dto.FileUploadResponseDto;
import com.tu.backend.storage.dto.InitMultipartUploadRequest;
import com.tu.backend.storage.dto.InitMultipartUploadResponse;
import com.tu.backend.storage.dto.MultipartUploadStatusDto;
import com.tu.backend.storage.dto.UploadPartResponse;
import com.tu.backend.storage.entity.FileAssetEntity;
import com.tu.backend.storage.entity.FileUploadSessionEntity;
import com.tu.backend.storage.repository.FileAssetRepository;
import com.tu.backend.storage.repository.FileUploadSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadResponse;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.ListPartsRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.UploadPartRequest;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix = "storage", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FileMultipartUploadService {

    private static final Logger log = LoggerFactory.getLogger(FileMultipartUploadService.class);
    private static final int MAX_PART_NUMBER = 10_000;

    private final S3Client s3Client;
    private final FileAssetRepository fileAssetRepository;
    private final FileUploadSessionRepository uploadSessionRepository;
    private final FileStorageProperties properties;
    private final ObjectMapper objectMapper;

    public FileMultipartUploadService(
        S3Client s3Client,
        FileAssetRepository fileAssetRepository,
        FileUploadSessionRepository uploadSessionRepository,
        FileStorageProperties properties,
        ObjectMapper objectMapper
    ) {
        this.s3Client = s3Client;
        this.fileAssetRepository = fileAssetRepository;
        this.uploadSessionRepository = uploadSessionRepository;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public InitMultipartUploadResponse initiate(InitMultipartUploadRequest request) {
        String contentType = FileUploadSupport.normalizeContentType(request.contentType());
        if (!FileUploadSupport.ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new BusinessException(40000, "unsupported file type");
        }
        long sizeBytes = request.sizeBytes();
        if (sizeBytes <= 0) {
            throw new BusinessException(40000, "file size required");
        }
        if (sizeBytes > FileUploadSupport.resolveMaxFileSize(properties, contentType)) {
            throw new BusinessException(40000, "file too large");
        }

        long chunkSizeBytes = resolveChunkSizeBytes(sizeBytes);
        int totalParts = (int) Math.ceil((double) sizeBytes / (double) chunkSizeBytes);
        if (totalParts > MAX_PART_NUMBER) {
            throw new BusinessException(40000, "file requires too many parts; increase chunk size");
        }

        ensureBucket();

        String fileId = "file-" + compactUuid();
        String extension = FileUploadSupport.extensionForContentType(contentType);
        String storageKey = "files/" + fileId + extension;
        String uploadSessionId = "upl-" + compactUuid();
        String filename = FileUploadSupport.safeFilename(request.filename());

        try {
            CreateMultipartUploadResponse created = s3Client.createMultipartUpload(
                CreateMultipartUploadRequest.builder()
                    .bucket(properties.getS3Bucket())
                    .key(storageKey)
                    .contentType(contentType)
                    .build()
            );

            FileUploadSessionEntity session = new FileUploadSessionEntity();
            session.setId(uploadSessionId);
            session.setFileId(fileId);
            session.setS3UploadId(created.uploadId());
            session.setStorageKey(storageKey);
            session.setOriginalFilename(filename);
            session.setContentType(contentType);
            session.setSizeBytes(sizeBytes);
            session.setChunkSizeBytes(chunkSizeBytes);
            session.setStatus(FileUploadSessionEntity.STATUS_UPLOADING);
            session.setPartsJson("[]");
            uploadSessionRepository.save(session);

            return new InitMultipartUploadResponse(
                uploadSessionId,
                fileId,
                chunkSizeBytes,
                sizeBytes,
                List.of()
            );
        } catch (S3Exception ex) {
            log.warn("failed to initiate multipart upload", ex);
            throw new BusinessException(50000, "failed to initiate multipart upload");
        }
    }

    @Transactional
    public MultipartUploadStatusDto status(String uploadId) {
        FileUploadSessionEntity session = requireUploadingSession(uploadId);
        Map<Integer, String> parts = syncPartsFromS3(session);
        return new MultipartUploadStatusDto(
            session.getId(),
            session.getFileId(),
            session.getStatus(),
            session.getSizeBytes(),
            session.getChunkSizeBytes(),
            sortedPartNumbers(parts)
        );
    }

    @Transactional
    public UploadPartResponse uploadPart(String uploadId, int partNumber, InputStream body, long contentLength) {
        if (partNumber < 1 || partNumber > MAX_PART_NUMBER) {
            throw new BusinessException(40000, "invalid part number");
        }
        if (contentLength <= 0) {
            throw new BusinessException(40000, "empty part");
        }

        FileUploadSessionEntity session = requireUploadingSession(uploadId);
        Map<Integer, String> parts = loadParts(session);
        if (parts.containsKey(partNumber)) {
            return new UploadPartResponse(partNumber, parts.get(partNumber));
        }

        long expected = expectedPartSize(session, partNumber);
        if (contentLength != expected) {
            throw new BusinessException(40000, "unexpected part size");
        }
        if (partNumber < totalParts(session) && contentLength < FileUploadSupport.MIN_MULTIPART_PART_BYTES) {
            throw new BusinessException(40000, "non-final part too small");
        }

        try {
            software.amazon.awssdk.services.s3.model.UploadPartResponse response = s3Client.uploadPart(
                UploadPartRequest.builder()
                    .bucket(properties.getS3Bucket())
                    .key(session.getStorageKey())
                    .uploadId(session.getS3UploadId())
                    .partNumber(partNumber)
                    .contentLength(contentLength)
                    .build(),
                RequestBody.fromInputStream(body, contentLength)
            );
            String etag = response.eTag();
            parts.put(partNumber, etag);
            session.setPartsJson(writeParts(parts));
            uploadSessionRepository.save(session);
            return new UploadPartResponse(partNumber, etag);
        } catch (S3Exception ex) {
            log.warn("failed to upload part; uploadId={}, part={}", uploadId, partNumber, ex);
            throw new BusinessException(50000, "failed to upload part");
        }
    }

    @Transactional
    public FileUploadResponseDto complete(String uploadId) {
        FileUploadSessionEntity session = requireUploadingSession(uploadId);
        Map<Integer, String> parts = syncPartsFromS3(session);
        int expectedParts = totalParts(session);
        if (parts.size() != expectedParts) {
            throw new BusinessException(40000, "missing parts; uploaded=" + parts.size() + ", expected=" + expectedParts);
        }
        for (int partNumber = 1; partNumber <= expectedParts; partNumber++) {
            if (!parts.containsKey(partNumber)) {
                throw new BusinessException(40000, "missing part " + partNumber);
            }
        }

        List<CompletedPart> completedParts = parts.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> CompletedPart.builder()
                .partNumber(entry.getKey())
                .eTag(entry.getValue())
                .build())
            .toList();

        try {
            s3Client.completeMultipartUpload(
                CompleteMultipartUploadRequest.builder()
                    .bucket(properties.getS3Bucket())
                    .key(session.getStorageKey())
                    .uploadId(session.getS3UploadId())
                    .multipartUpload(CompletedMultipartUpload.builder().parts(completedParts).build())
                    .build()
            );
        } catch (S3Exception ex) {
            log.warn("failed to complete multipart upload; uploadId={}", uploadId, ex);
            throw new BusinessException(50000, "failed to complete multipart upload");
        }

        FileAssetEntity entity = new FileAssetEntity();
        entity.setId(session.getFileId());
        entity.setStorageKey(session.getStorageKey());
        entity.setOriginalFilename(session.getOriginalFilename());
        entity.setContentType(session.getContentType());
        entity.setSizeBytes(session.getSizeBytes());
        fileAssetRepository.save(entity);

        session.setStatus(FileUploadSessionEntity.STATUS_COMPLETED);
        uploadSessionRepository.save(session);

        return new FileUploadResponseDto(
            entity.getId(),
            "/api/files/" + entity.getId(),
            entity.getContentType(),
            entity.getSizeBytes()
        );
    }

    @Transactional
    public void abort(String uploadId) {
        FileUploadSessionEntity session = uploadSessionRepository.findById(uploadId)
            .orElseThrow(() -> new BusinessException(40001, "upload session not found"));
        if (FileUploadSessionEntity.STATUS_COMPLETED.equals(session.getStatus())
            || FileUploadSessionEntity.STATUS_ABORTED.equals(session.getStatus())) {
            return;
        }
        try {
            s3Client.abortMultipartUpload(
                AbortMultipartUploadRequest.builder()
                    .bucket(properties.getS3Bucket())
                    .key(session.getStorageKey())
                    .uploadId(session.getS3UploadId())
                    .build()
            );
        } catch (S3Exception ex) {
            log.warn("failed to abort multipart upload; uploadId={}", uploadId, ex);
        }
        session.setStatus(FileUploadSessionEntity.STATUS_ABORTED);
        uploadSessionRepository.save(session);
    }

    public long getMultipartThresholdBytes() {
        return properties.getMultipartThresholdBytes();
    }

    public long getMultipartChunkSizeBytes() {
        return properties.getMultipartChunkSizeBytes();
    }

    public long getMaxFileSizeBytes() {
        return properties.getMaxFileSize();
    }

    public long getMaxPdfFileSizeBytes() {
        return properties.getMaxPdfFileSize();
    }

    private void ensureBucket() {
        String bucket = properties.getS3Bucket();
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (S3Exception ex) {
            if (ex.statusCode() != 404) {
                throw ex;
            }
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
            log.info("Created S3 bucket {}", bucket);
        }
    }

    private FileUploadSessionEntity requireUploadingSession(String uploadId) {
        FileUploadSessionEntity session = uploadSessionRepository.findById(uploadId)
            .orElseThrow(() -> new BusinessException(40001, "upload session not found"));
        if (!FileUploadSessionEntity.STATUS_UPLOADING.equals(session.getStatus())) {
            throw new BusinessException(40000, "upload session is not active");
        }
        return session;
    }

    private long resolveChunkSizeBytes(long sizeBytes) {
        long configured = properties.getMultipartChunkSizeBytes();
        long chunk = Math.max(configured, FileUploadSupport.MIN_MULTIPART_PART_BYTES);
        int parts = (int) Math.ceil((double) sizeBytes / (double) chunk);
        if (parts <= MAX_PART_NUMBER) {
            return chunk;
        }
        long minChunk = (long) Math.ceil((double) sizeBytes / (double) MAX_PART_NUMBER);
        return Math.max(minChunk, FileUploadSupport.MIN_MULTIPART_PART_BYTES);
    }

    private int totalParts(FileUploadSessionEntity session) {
        return (int) Math.ceil((double) session.getSizeBytes() / (double) session.getChunkSizeBytes());
    }

    private long expectedPartSize(FileUploadSessionEntity session, int partNumber) {
        int total = totalParts(session);
        if (partNumber < total) {
            return session.getChunkSizeBytes();
        }
        long remainder = session.getSizeBytes() % session.getChunkSizeBytes();
        return remainder == 0 ? session.getChunkSizeBytes() : remainder;
    }

    private Map<Integer, String> syncPartsFromS3(FileUploadSessionEntity session) {
        Map<Integer, String> parts = loadParts(session);
        try {
            s3Client.listPartsPaginator(
                ListPartsRequest.builder()
                    .bucket(properties.getS3Bucket())
                    .key(session.getStorageKey())
                    .uploadId(session.getS3UploadId())
                    .build()
            ).parts().forEach(part -> parts.put(part.partNumber(), part.eTag()));
            session.setPartsJson(writeParts(parts));
            uploadSessionRepository.save(session);
        } catch (S3Exception ex) {
            log.warn("failed to list multipart parts; uploadId={}", session.getId(), ex);
        }
        return parts;
    }

    private Map<Integer, String> loadParts(FileUploadSessionEntity session) {
        Map<Integer, String> parts = new LinkedHashMap<>();
        String json = session.getPartsJson();
        if (!StringUtils.hasText(json)) {
            return parts;
        }
        try {
            List<PartEtag> parsed = objectMapper.readValue(json, new TypeReference<>() {
            });
            for (PartEtag part : parsed) {
                if (part.partNumber() > 0 && StringUtils.hasText(part.etag())) {
                    parts.put(part.partNumber(), part.etag());
                }
            }
        } catch (JsonProcessingException ex) {
            log.warn("invalid parts_json; uploadId={}", session.getId(), ex);
        }
        return parts;
    }

    private String writeParts(Map<Integer, String> parts) {
        List<PartEtag> list = new ArrayList<>();
        parts.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .forEach(entry -> list.add(new PartEtag(entry.getKey(), entry.getValue())));
        try {
            return objectMapper.writeValueAsString(list);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50000, "failed to serialize upload parts");
        }
    }

    private static List<Integer> sortedPartNumbers(Map<Integer, String> parts) {
        return parts.keySet().stream().sorted(Comparator.naturalOrder()).toList();
    }

    private static String compactUuid() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private record PartEtag(int partNumber, String etag) {
    }
}
