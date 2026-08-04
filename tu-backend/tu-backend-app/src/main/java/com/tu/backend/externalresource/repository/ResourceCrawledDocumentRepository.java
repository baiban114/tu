package com.tu.backend.externalresource.repository;

import com.tu.backend.externalresource.entity.ResourceCrawledDocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ResourceCrawledDocumentRepository extends JpaRepository<ResourceCrawledDocumentEntity, String> {

    Optional<ResourceCrawledDocumentEntity> findByResourceItemId(String resourceItemId);

    void deleteByResourceItemId(String resourceItemId);
}
