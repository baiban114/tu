package com.tu.backend.externalresource.repository;

import com.tu.backend.externalresource.entity.ResourcePdfRegionNoteEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResourcePdfRegionNoteRepository extends JpaRepository<ResourcePdfRegionNoteEntity, String> {

    List<ResourcePdfRegionNoteEntity> findByResourceItemIdOrderByStartPageAscCreatedAtAsc(String resourceItemId);

    List<ResourcePdfRegionNoteEntity> findByExcerptIdOrderByCreatedAtAsc(String excerptId);

    void deleteByResourceItemId(String resourceItemId);

    void deleteByExcerptId(String excerptId);
}
