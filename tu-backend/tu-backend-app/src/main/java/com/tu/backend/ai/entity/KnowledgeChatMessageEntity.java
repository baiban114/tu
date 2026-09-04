package com.tu.backend.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "knowledge_chat_message",
    indexes = {
        @Index(name = "idx_knowledge_chat_message_session", columnList = "session_id, message_index")
    },
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_knowledge_chat_message_session_index",
            columnNames = {"session_id", "message_index"}
        )
    }
)
public class KnowledgeChatMessageEntity {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "session_id", length = 64, nullable = false)
    private String sessionId;

    @Column(name = "message_index", nullable = false)
    private Integer messageIndex;

    @Column(length = 16, nullable = false)
    private String role;

    @Lob
    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Lob
    @Column(name = "reasoning_content", columnDefinition = "text")
    private String reasoningContent;

    @Lob
    @Column(name = "sources_json", columnDefinition = "text")
    private String sourcesJson;

    @Column(name = "selected_kb_id", length = 64)
    private String selectedKbId;

    @Column(name = "selected_kb_name", length = 128)
    private String selectedKbName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        createdAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public Integer getMessageIndex() {
        return messageIndex;
    }

    public void setMessageIndex(Integer messageIndex) {
        this.messageIndex = messageIndex;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getReasoningContent() {
        return reasoningContent;
    }

    public void setReasoningContent(String reasoningContent) {
        this.reasoningContent = reasoningContent;
    }

    public String getSourcesJson() {
        return sourcesJson;
    }

    public void setSourcesJson(String sourcesJson) {
        this.sourcesJson = sourcesJson;
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
}
