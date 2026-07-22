package com.tu.backend.storage;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.common.BusinessException;
import com.tu.backend.storage.dto.FileUploadConfigDto;
import com.tu.backend.storage.dto.FileUploadResponseDto;
import com.tu.backend.storage.dto.InitMultipartUploadRequest;
import com.tu.backend.storage.dto.InitMultipartUploadResponse;
import com.tu.backend.storage.dto.MultipartUploadStatusDto;
import com.tu.backend.storage.dto.UploadPartResponse;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/files")
@ConditionalOnProperty(prefix = "storage", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FileController {

    private final FileStorageService fileStorageService;
    private final FileMultipartUploadService multipartUploadService;

    public FileController(
        FileStorageService fileStorageService,
        FileMultipartUploadService multipartUploadService
    ) {
        this.fileStorageService = fileStorageService;
        this.multipartUploadService = multipartUploadService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<FileUploadResponseDto> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(fileStorageService.upload(file));
    }

    @GetMapping("/upload-config")
    public ApiResponse<FileUploadConfigDto> uploadConfig() {
        return ApiResponse.success(new FileUploadConfigDto(
            multipartUploadService.getMultipartThresholdBytes(),
            multipartUploadService.getMultipartChunkSizeBytes(),
            multipartUploadService.getMaxFileSizeBytes(),
            multipartUploadService.getMaxPdfFileSizeBytes()
        ));
    }

    @PostMapping(value = "/uploads", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<InitMultipartUploadResponse> initiateMultipartUpload(
        @Valid @RequestBody InitMultipartUploadRequest request
    ) {
        return ApiResponse.success(multipartUploadService.initiate(request));
    }

    @GetMapping("/uploads/{uploadId}")
    public ApiResponse<MultipartUploadStatusDto> multipartUploadStatus(@PathVariable("uploadId") String uploadId) {
        return ApiResponse.success(multipartUploadService.status(uploadId));
    }

    @PutMapping(value = "/uploads/{uploadId}/parts/{partNumber}", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ApiResponse<UploadPartResponse> uploadPart(
        @PathVariable("uploadId") String uploadId,
        @PathVariable("partNumber") int partNumber,
        @RequestHeader(value = HttpHeaders.CONTENT_LENGTH, required = false) Long contentLength,
        InputStream body
    ) {
    long length = contentLength == null ? -1L : contentLength;
        if (length <= 0) {
            throw new BusinessException(40000, "Content-Length required");
        }
        return ApiResponse.success(multipartUploadService.uploadPart(uploadId, partNumber, body, length));
    }

    @PostMapping("/uploads/{uploadId}/complete")
    public ApiResponse<FileUploadResponseDto> completeMultipartUpload(@PathVariable("uploadId") String uploadId) {
        return ApiResponse.success(multipartUploadService.complete(uploadId));
    }

    @DeleteMapping("/uploads/{uploadId}")
    public ApiResponse<Void> abortMultipartUpload(@PathVariable("uploadId") String uploadId) {
        multipartUploadService.abort(uploadId);
        return ApiResponse.success(null);
    }

    @GetMapping({"/{id}", "/{id}/"})
    public ResponseEntity<StreamingResponseBody> download(
        @PathVariable("id") String id,
        @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader
    ) {
        long totalSize = fileStorageService.fileSize(id);
        FileStorageService.StoredFile stored;
        HttpByteRange byteRange = null;
        HttpStatus status = HttpStatus.OK;

        if (rangeHeader != null && !rangeHeader.isBlank()) {
            byteRange = HttpByteRange.parse(rangeHeader, totalSize);
            stored = fileStorageService.openRange(id, byteRange);
            status = HttpStatus.PARTIAL_CONTENT;
        } else {
            stored = fileStorageService.open(id);
        }

        StreamingResponseBody body = outputStream -> {
            try (InputStream input = stored.stream()) {
                input.transferTo(outputStream);
            }
        };

        ContentDisposition disposition = ContentDisposition.inline()
            .filename(stored.filename(), StandardCharsets.UTF_8)
            .build();

        var builder = ResponseEntity.status(status)
            .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic())
            .contentType(MediaType.parseMediaType(stored.contentType()))
            .contentLength(stored.sizeBytes())
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
            .header(HttpHeaders.ACCEPT_RANGES, "bytes");

        if (byteRange != null) {
            builder.header(HttpHeaders.CONTENT_RANGE, byteRange.toContentRangeValue(totalSize));
        }

        return builder.body(body);
    }
}
