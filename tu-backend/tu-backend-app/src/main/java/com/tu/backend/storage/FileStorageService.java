package com.tu.backend.storage;

import com.tu.backend.common.BusinessException;
import com.tu.backend.storage.dto.FileUploadResponseDto;
import com.tu.backend.storage.entity.FileAssetEntity;
import com.tu.backend.storage.repository.FileAssetRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix = "storage", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    private final S3Client s3Client;
    private final FileAssetRepository fileAssetRepository;
    private final FileStorageProperties properties;

    public FileStorageService(
        S3Client s3Client,
        FileAssetRepository fileAssetRepository,
        FileStorageProperties properties
    ) {
        this.s3Client = s3Client;
        this.fileAssetRepository = fileAssetRepository;
        this.properties = properties;
    }

    @PostConstruct
    public void initBucket() {
        try {
            ensureBucket();
        } catch (Exception ex) {
            log.warn("MinIO/S3 bucket check failed (upload will retry): {}", ex.getMessage());
        }
    }

    public FileUploadResponseDto upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(40000, "file required");
        }

        String contentType = FileUploadSupport.normalizeContentType(file.getContentType());
        if (file.getSize() > FileUploadSupport.resolveMaxFileSize(properties, contentType)) {
            throw new BusinessException(40000, "file too large");
        }

        if (!FileUploadSupport.ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new BusinessException(40000, "unsupported file type");
        }

        ensureBucket();

        String id = "file-" + UUID.randomUUID().toString().replace("-", "");
        String extension = FileUploadSupport.extensionForContentType(contentType);
        String storageKey = "files/" + id + extension;

        try {
            s3Client.putObject(
                PutObjectRequest.builder()
                    .bucket(properties.getS3Bucket())
                    .key(storageKey)
                    .contentType(contentType)
                    .contentLength(file.getSize())
                    .build(),
                RequestBody.fromInputStream(file.getInputStream(), file.getSize())
            );
        } catch (IOException ex) {
            throw new BusinessException(50000, "failed to read upload");
        } catch (S3Exception ex) {
            throw new BusinessException(50000, "failed to store file");
        }

        FileAssetEntity entity = new FileAssetEntity();
        entity.setId(id);
        entity.setStorageKey(storageKey);
        entity.setOriginalFilename(StringUtils.cleanPath(
            FileUploadSupport.safeFilename(file.getOriginalFilename())
        ));
        entity.setContentType(contentType);
        entity.setSizeBytes(file.getSize());
        fileAssetRepository.save(entity);

        return new FileUploadResponseDto(id, "/api/files/" + id, contentType, file.getSize());
    }

    public StoredFile open(String id) {
        FileAssetEntity entity = requireEntity(id);
        return openFromEntity(entity, null);
    }

    public StoredFile openRange(String id, HttpByteRange range) {
        FileAssetEntity entity = requireEntity(id);
        return openFromEntity(entity, range);
    }

    public long fileSize(String id) {
        return requireEntity(id).getSizeBytes();
    }

    private FileAssetEntity requireEntity(String id) {
        return fileAssetRepository.findById(id)
            .orElseThrow(() -> new BusinessException(40001, "file not found"));
    }

    private StoredFile openFromEntity(FileAssetEntity entity, HttpByteRange range) {
        try {
            var requestBuilder = GetObjectRequest.builder()
                .bucket(properties.getS3Bucket())
                .key(entity.getStorageKey());
            if (range != null) {
                requestBuilder.range(range.toS3RangeValue());
            }
            InputStream stream = s3Client.getObject(requestBuilder.build());
            long sizeBytes = range == null ? entity.getSizeBytes() : range.length();
            return new StoredFile(stream, entity.getContentType(), sizeBytes, entity.getOriginalFilename());
        } catch (S3Exception ex) {
            throw new BusinessException(50000, "failed to read file");
        }
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

    public record StoredFile(
        InputStream stream,
        String contentType,
        long sizeBytes,
        String filename
    ) {
    }
}
