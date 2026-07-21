package com.tu.backend.kbresourcelink.repository;

import com.tu.backend.kbresourcelink.entity.KbResourceLinkEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface KbResourceLinkRepository extends JpaRepository<KbResourceLinkEntity, String> {

    List<KbResourceLinkEntity> findByKbIdOrderBySortOrderAscCreatedAtAsc(String kbId);

    Optional<KbResourceLinkEntity> findByKbIdAndResourceItemId(String kbId, String resourceItemId);

    boolean existsByKbIdAndResourceItemId(String kbId, String resourceItemId);

    void deleteByKbIdAndResourceItemId(String kbId, String resourceItemId);
}
