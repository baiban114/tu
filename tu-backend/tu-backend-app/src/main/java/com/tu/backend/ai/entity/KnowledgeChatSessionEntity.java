package com.tu.backend.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "knowledge_chat_session",
    indexes = {
        @Index(name = "idx_knowledge_chat_session_user_created", columnList = "user_id, created_at")
    }
)
public class KnowledgeChatSessionEntity {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "user_id", length = 64, nullable = false)
    private String userId;

    @Column(length = 160, nullable = false)
    private String title;

    @Column(name = "selected_kb_id", length = 64)
    private String selectedKbId;

    @Column(name = "selected_kb_name", length = 128)
    private String selectedKbName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSelectedKbId() {
        return selectedKbId;
    }

    public void setSelectedKbId(String selectedKbId) {
        this.selectedKbId = selectedKbId;
    }

    public String getSelectedKbName() {
        return selectedKbName;
    }

    public void setSelectedKbName(String selectedKbName) {
        this.selectedKbName = selectedKbName;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
