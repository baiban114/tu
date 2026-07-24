package com.tu.backend.externalresource.controller;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.externalresource.dto.CreateResourcePdfRegionNoteRequest;
import com.tu.backend.externalresource.dto.ResourcePdfRegionNoteDto;
import com.tu.backend.externalresource.dto.UpdateResourcePdfRegionNoteRequest;
import com.tu.backend.externalresource.service.ResourcePdfRegionNoteService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ResourcePdfRegionNoteController {

    private final ResourcePdfRegionNoteService noteService;

    public ResourcePdfRegionNoteController(ResourcePdfRegionNoteService noteService) {
        this.noteService = noteService;
    }

    @GetMapping("/resource-items/{id}/pdf-region-notes")
    public ApiResponse<List<ResourcePdfRegionNoteDto>> list(@PathVariable String id) {
        return ApiResponse.success(noteService.listByResourceItem(id));
    }

    @PostMapping("/resource-items/{id}/pdf-region-notes")
    public ApiResponse<ResourcePdfRegionNoteDto> create(
        @PathVariable String id,
        @Valid @RequestBody CreateResourcePdfRegionNoteRequest request
    ) {
        return ApiResponse.success(noteService.create(id, request));
    }

    @PatchMapping("/resource-pdf-region-notes/{noteId}")
    public ApiResponse<ResourcePdfRegionNoteDto> update(
        @PathVariable String noteId,
        @Valid @RequestBody UpdateResourcePdfRegionNoteRequest request
    ) {
        return ApiResponse.success(noteService.update(noteId, request));
    }

    @DeleteMapping("/resource-pdf-region-notes/{noteId}")
    public ApiResponse<Void> delete(@PathVariable String noteId) {
        noteService.delete(noteId);
        return ApiResponse.success();
    }
}
