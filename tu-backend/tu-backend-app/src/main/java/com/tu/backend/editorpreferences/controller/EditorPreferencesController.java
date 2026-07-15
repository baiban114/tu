package com.tu.backend.editorpreferences.controller;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.editorpreferences.dto.EditorPreferencesDto;
import com.tu.backend.editorpreferences.dto.UpdateEditorPreferencesRequest;
import com.tu.backend.editorpreferences.service.EditorPreferencesService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/editor-preferences")
public class EditorPreferencesController {

    private final EditorPreferencesService preferencesService;

    public EditorPreferencesController(EditorPreferencesService preferencesService) {
        this.preferencesService = preferencesService;
    }

    @GetMapping
    public ApiResponse<EditorPreferencesDto> getPreferences() {
        return ApiResponse.success(preferencesService.getPreferences());
    }

    @PutMapping
    public ApiResponse<EditorPreferencesDto> updatePreferences(
        @Valid @RequestBody UpdateEditorPreferencesRequest request
    ) {
        return ApiResponse.success(preferencesService.updatePreferences(request));
    }
}
