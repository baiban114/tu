package com.tu.backend.externalresource.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/** Crawled web page content stored as a standalone Markdown document (no KB/Page dependency). */
@Entity
@Table(name = "resource_crawled_document", uniqueConstraints = {
    @UniqueConstraint(name = "uk_resource_crawled_document_item", columnNames = "resource_item_id")
})
public class ResourceCrawledDocumentEntity {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "resource_item_id", length = 64, nullable = false)
    private String resourceItemId;

    @Column(name = "source_url", length = 1024, nullable = false)
    private String sourceUrl;

    @Column(length = 512)
    private String title;

    @Column(columnDefinition = "longtext")
    private String content;

    @Column(name = "crawled_at", nullable = false)
    private LocalDateTime crawledAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (this.crawledAt == null) {
            this.crawledAt = now;
        }
        this.updatedAt = now;
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

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public LocalDateTime getCrawledAt() {
        return crawledAt;
    }

    public void setCrawledAt(LocalDateTime crawledAt) {
        this.crawledAt = crawledAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
