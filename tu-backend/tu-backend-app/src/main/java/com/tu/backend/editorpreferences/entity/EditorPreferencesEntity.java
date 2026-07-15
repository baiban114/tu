package com.tu.backend.editorpreferences.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "editor_preferences")
public class EditorPreferencesEntity {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "selection_toolbar_enabled", nullable = false)
    private boolean selectionToolbarEnabled;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
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

    public boolean isSelectionToolbarEnabled() {
        return selectionToolbarEnabled;
    }

    public void setSelectionToolbarEnabled(boolean selectionToolbarEnabled) {
        this.selectionToolbarEnabled = selectionToolbarEnabled;
    }
}
