package com.tu.backend.editorpreferences.service;

import com.tu.backend.editorpreferences.dto.EditorPreferencesDto;
import com.tu.backend.editorpreferences.dto.UpdateEditorPreferencesRequest;
import com.tu.backend.editorpreferences.entity.EditorPreferencesEntity;
import com.tu.backend.editorpreferences.repository.EditorPreferencesRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EditorPreferencesService {

    public static final String CONFIG_ID = "default";

    /**
     * Default value when no record exists yet. {@code true} preserves the
     * historical behaviour (the selection toolbar always showed) until a user
     * explicitly turns it off from the system settings page.
     */
    public static final boolean DEFAULT_SELECTION_TOOLBAR_ENABLED = true;

    private final EditorPreferencesRepository repository;

    public EditorPreferencesService(EditorPreferencesRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public EditorPreferencesDto getPreferences() {
        return repository.findById(CONFIG_ID)
            .map(this::toDto)
            .orElseGet(this::defaultDto);
    }

    @Transactional
    public EditorPreferencesDto updatePreferences(UpdateEditorPreferencesRequest request) {
        EditorPreferencesEntity entity = repository.findById(CONFIG_ID).orElseGet(() -> {
            EditorPreferencesEntity created = new EditorPreferencesEntity();
            created.setId(CONFIG_ID);
            return created;
        });
        entity.setSelectionToolbarEnabled(request.selectionToolbarEnabled());
        return toDto(repository.save(entity));
    }

    private EditorPreferencesDto toDto(EditorPreferencesEntity entity) {
        return new EditorPreferencesDto(entity.isSelectionToolbarEnabled());
    }

    private EditorPreferencesDto defaultDto() {
        return new EditorPreferencesDto(DEFAULT_SELECTION_TOOLBAR_ENABLED);
    }
}
