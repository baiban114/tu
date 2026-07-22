package com.tu.backend.storage.repository;

import com.tu.backend.storage.entity.FileUploadSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FileUploadSessionRepository extends JpaRepository<FileUploadSessionEntity, String> {
}
