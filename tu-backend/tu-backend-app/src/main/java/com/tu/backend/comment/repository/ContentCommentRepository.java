package com.tu.backend.comment.repository;

import com.tu.backend.comment.entity.ContentCommentEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ContentCommentRepository extends JpaRepository<ContentCommentEntity, String> {

    @Query("""
        select c from ContentCommentEntity c
        where c.pageId = :pageId
          and c.parentId is null
          and ((:annotationId is null and c.annotationId is null)
            or c.annotationId = :annotationId)
        """)
    Page<ContentCommentEntity> findRootComments(
        @Param("pageId") String pageId,
        @Param("annotationId") String annotationId,
        Pageable pageable
    );

    Page<ContentCommentEntity> findByParentIdOrderByCreatedAtAsc(String parentId, Pageable pageable);

    List<ContentCommentEntity> findByParentId(String parentId);

    long countByParentId(String parentId);
}
