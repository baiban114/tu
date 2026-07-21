package com.tu.backend.kbresourcelink.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "kb_resource_link",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_kb_resource_link_kb_item", columnNames = {"kb_id", "resource_item_id"})
    }
)
public class KbResourceLinkEntity {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "kb_id", length = 64, nullable = false)
    private String kbId;

    @Column(name = "resource_item_id", length = 64, nullable = false)
    private String resourceItemId;

    /** When set, the link appears under this page in the KB page tree; null = KB root. */
    @Column(name = "parent_page_id", length = 64)
    private String parentPageId;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getKbId() {
        return kbId;
    }

    public void setKbId(String kbId) {
        this.kbId = kbId;
    }

    public String getResourceItemId() {
        return resourceItemId;
    }

    public void setResourceItemId(String resourceItemId) {
        this.resourceItemId = resourceItemId;
    }

    public String getParentPageId() {
        return parentPageId;
    }

    public void setParentPageId(String parentPageId) {
        this.parentPageId = parentPageId;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
