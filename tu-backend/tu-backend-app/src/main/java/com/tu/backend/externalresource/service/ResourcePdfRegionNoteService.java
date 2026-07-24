package com.tu.backend.externalresource.service;

import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.dto.CreateResourcePdfRegionNoteRequest;
import com.tu.backend.externalresource.dto.ResourcePdfRegionNoteDto;
import com.tu.backend.externalresource.dto.UpdateResourcePdfRegionNoteRequest;
import com.tu.backend.externalresource.entity.ResourceItemEntity;
import com.tu.backend.externalresource.entity.ResourcePdfRegionNoteEntity;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.externalresource.repository.ResourcePdfRegionNoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class ResourcePdfRegionNoteService {

    private final ResourceItemRepository itemRepository;
    private final ResourcePdfRegionNoteRepository noteRepository;

    public ResourcePdfRegionNoteService(
        ResourceItemRepository itemRepository,
        ResourcePdfRegionNoteRepository noteRepository
    ) {
        this.itemRepository = itemRepository;
        this.noteRepository = noteRepository;
    }

    @Transactional(readOnly = true)
    public List<ResourcePdfRegionNoteDto> listByResourceItem(String resourceItemId) {
        findItem(resourceItemId);
        return noteRepository.findByResourceItemIdOrderByStartPageAscCreatedAtAsc(resourceItemId)
            .stream()
            .map(this::toDto)
            .toList();
    }

    @Transactional
    public ResourcePdfRegionNoteDto create(String resourceItemId, CreateResourcePdfRegionNoteRequest request) {
        findItem(resourceItemId);
        int startPage = request.startPage();
        int endPage = Math.max(startPage, request.endPage());
        double clipTop = clampRatio(request.clipTop());
        double clipBottom = clampRatio(request.clipBottom());
        if (startPage == endPage && clipBottom < clipTop) {
            throw new BusinessException(40000, "clipBottom must be >= clipTop on the same page");
        }

        ResourcePdfRegionNoteEntity entity = new ResourcePdfRegionNoteEntity();
        entity.setId("rpn-" + compactUuid());
        entity.setResourceItemId(resourceItemId);
        entity.setFileId(blankToNull(request.fileId()));
        entity.setStartPage(startPage);
        entity.setEndPage(endPage);
        entity.setClipTop(clipTop);
        entity.setClipBottom(clipBottom);
        entity.setNote(request.note().trim());
        entity.setColor(blankToNull(request.color()));
        return toDto(noteRepository.save(entity));
    }

    @Transactional
    public ResourcePdfRegionNoteDto update(String noteId, UpdateResourcePdfRegionNoteRequest request) {
        ResourcePdfRegionNoteEntity entity = findNote(noteId);
        if (request.startPage() != null) {
            entity.setStartPage(request.startPage());
        }
        if (request.endPage() != null) {
            entity.setEndPage(request.endPage());
        }
        int startPage = entity.getStartPage();
        int endPage = Math.max(startPage, entity.getEndPage());
        entity.setEndPage(endPage);

        if (request.clipTop() != null) {
            entity.setClipTop(clampRatio(request.clipTop()));
        }
        if (request.clipBottom() != null) {
            entity.setClipBottom(clampRatio(request.clipBottom()));
        }
        if (startPage == endPage && entity.getClipBottom() < entity.getClipTop()) {
            throw new BusinessException(40000, "clipBottom must be >= clipTop on the same page");
        }
        if (request.note() != null) {
            String note = request.note().trim();
            if (note.isEmpty()) {
                throw new BusinessException(40000, "note must not be blank");
            }
            entity.setNote(note);
        }
        if (request.fileId() != null) {
            entity.setFileId(blankToNull(request.fileId()));
        }
        if (request.color() != null) {
            entity.setColor(blankToNull(request.color()));
        }
        return toDto(noteRepository.save(entity));
    }

    @Transactional
    public void delete(String noteId) {
        ResourcePdfRegionNoteEntity entity = findNote(noteId);
        noteRepository.delete(entity);
    }

    @Transactional
    public void deleteByResourceItemId(String resourceItemId) {
        noteRepository.deleteByResourceItemId(resourceItemId);
    }

    private ResourceItemEntity findItem(String id) {
        return itemRepository.findById(id)
            .orElseThrow(() -> new BusinessException(40001, "resource item not found"));
    }

    private ResourcePdfRegionNoteEntity findNote(String id) {
        return noteRepository.findById(id)
            .orElseThrow(() -> new BusinessException(40001, "resource pdf region note not found"));
    }

    private ResourcePdfRegionNoteDto toDto(ResourcePdfRegionNoteEntity entity) {
        return new ResourcePdfRegionNoteDto(
            entity.getId(),
            entity.getResourceItemId(),
            entity.getFileId(),
            entity.getStartPage(),
            entity.getEndPage(),
            entity.getClipTop(),
            entity.getClipBottom(),
            entity.getNote(),
            entity.getColor(),
            entity.getCreatedAt(),
            entity.getUpdatedAt()
        );
    }

    private static double clampRatio(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return 0d;
        }
        return Math.min(1d, Math.max(0d, Math.round(value * 1000d) / 1000d));
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String compactUuid() {
        return UUID.randomUUID().toString().replace("-", "").toLowerCase(Locale.ROOT);
    }
}
