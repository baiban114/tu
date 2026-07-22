package com.tu.backend.storage.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "file_upload_session")
public class FileUploadSessionEntity {

    public static final String STATUS_UPLOADING = "uploading";
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_ABORTED = "aborted";

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "file_id", length = 64, nullable = false)
    private String fileId;

    @Column(name = "s3_upload_id", length = 256, nullable = false)
    private String s3UploadId;

    @Column(name = "storage_key", length = 512, nullable = false)
    private String storageKey;

    @Column(name = "original_filename", length = 512)
    private String originalFilename;

    @Column(name = "content_type", length = 128, nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "chunk_size_bytes", nullable = false)
    private long chunkSizeBytes;

    @Column(length = 32, nullable = false)
    private String status = STATUS_UPLOADING;

    /** JSON array: [{"partNumber":1,"etag":"..."}] */
    @Column(name = "parts_json", columnDefinition = "text")
    private String partsJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.status == null || this.status.isBlank()) {
            this.status = STATUS_UPLOADING;
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getFileId() {
        return fileId;
    }

    public void setFileId(String fileId) {
        this.fileId = fileId;
    }

    public String getS3UploadId() {
        return s3UploadId;
    }

    public void setS3UploadId(String s3UploadId) {
        this.s3UploadId = s3UploadId;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public void setStorageKey(String storageKey) {
        this.storageKey = storageKey;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public void setOriginalFilename(String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    public long getChunkSizeBytes() {
        return chunkSizeBytes;
    }

    public void setChunkSizeBytes(long chunkSizeBytes) {
        this.chunkSizeBytes = chunkSizeBytes;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPartsJson() {
        return partsJson;
    }

    public void setPartsJson(String partsJson) {
        this.partsJson = partsJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
