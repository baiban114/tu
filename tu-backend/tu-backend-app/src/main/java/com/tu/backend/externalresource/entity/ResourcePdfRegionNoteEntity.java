package com.tu.backend.externalresource.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Index;

import java.time.LocalDateTime;

/**
 * PDF vertical region note bound to a resource item (not a page block).
 * Survives PDF↔link conversion and appears on any embed of the same resource.
 */
@Entity
@Table(
    name = "external_resource_pdf_region_note",
    indexes = {
        @Index(name = "idx_resource_pdf_region_note_item", columnList = "resource_item_id")
    }
)
public class ResourcePdfRegionNoteEntity {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "resource_item_id", length = 64, nullable = false)
    private String resourceItemId;

    /** Optional stored file id for helpers; identity is resource_item_id + geometry. */
    @Column(name = "file_id", length = 64)
    private String fileId;

    @Column(name = "start_page", nullable = false)
    private Integer startPage;

    @Column(name = "end_page", nullable = false)
    private Integer endPage;

    @Column(name = "clip_top", nullable = false)
    private Double clipTop;

    @Column(name = "clip_bottom", nullable = false)
    private Double clipBottom;

    @Column(nullable = false, columnDefinition = "text")
    private String note;

    @Column(length = 32)
    private String color;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.clipTop == null) {
            this.clipTop = 0d;
        }
        if (this.clipBottom == null) {
            this.clipBottom = 1d;
        }
        if (this.color == null || this.color.isBlank()) {
            this.color = "#FFE082";
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

    public String getResourceItemId() {
        return resourceItemId;
    }

    public void setResourceItemId(String resourceItemId) {
        this.resourceItemId = resourceItemId;
    }

    public String getFileId() {
        return fileId;
    }

    public void setFileId(String fileId) {
        this.fileId = fileId;
    }

    public Integer getStartPage() {
        return startPage;
    }

    public void setStartPage(Integer startPage) {
        this.startPage = startPage;
    }

    public Integer getEndPage() {
        return endPage;
    }

    public void setEndPage(Integer endPage) {
        this.endPage = endPage;
    }

    public Double getClipTop() {
        return clipTop;
    }

    public void setClipTop(Double clipTop) {
        this.clipTop = clipTop;
    }

    public Double getClipBottom() {
        return clipBottom;
    }

    public void setClipBottom(Double clipBottom) {
        this.clipBottom = clipBottom;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
