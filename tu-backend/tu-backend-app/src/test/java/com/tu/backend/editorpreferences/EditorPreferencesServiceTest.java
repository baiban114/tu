package com.tu.backend.editorpreferences;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.tu.backend.editorpreferences.dto.EditorPreferencesDto;
import com.tu.backend.editorpreferences.dto.UpdateEditorPreferencesRequest;
import com.tu.backend.editorpreferences.entity.EditorPreferencesEntity;
import com.tu.backend.editorpreferences.repository.EditorPreferencesRepository;
import com.tu.backend.editorpreferences.service.EditorPreferencesService;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class EditorPreferencesServiceTest {

    @Test
    void returnsDefaultWhenNoRecordExists() {
        EditorPreferencesRepository repository = mock(EditorPreferencesRepository.class);
        when(repository.findById(EditorPreferencesService.CONFIG_ID)).thenReturn(Optional.empty());
        EditorPreferencesService service = new EditorPreferencesService(repository);

        EditorPreferencesDto dto = service.getPreferences();

        assertThat(dto.selectionToolbarEnabled()).isTrue();
    }

    @Test
    void persistsSelectionToolbarEnabled() {
        TestContext context = new TestContext();
        EditorPreferencesService service = context.service();

        EditorPreferencesDto dto = service.updatePreferences(new UpdateEditorPreferencesRequest(false));

        assertThat(dto.selectionToolbarEnabled()).isFalse();
        assertThat(service.getPreferences().selectionToolbarEnabled()).isFalse();
    }

    @Test
    void updateCreatesRecordWhenAbsent() {
        TestContext context = new TestContext();
        EditorPreferencesService service = context.service();

        // Record does not exist yet; update should create it with the requested value.
        assertThat(context.contains(EditorPreferencesService.CONFIG_ID)).isFalse();
        EditorPreferencesDto dto = service.updatePreferences(new UpdateEditorPreferencesRequest(true));

        assertThat(dto.selectionToolbarEnabled()).isTrue();
        assertThat(context.contains(EditorPreferencesService.CONFIG_ID)).isTrue();
    }

    @Test
    void updateOverwritesExistingValue() {
        TestContext context = new TestContext();
        EditorPreferencesService service = context.service();
        service.updatePreferences(new UpdateEditorPreferencesRequest(false));

        EditorPreferencesDto dto = service.updatePreferences(new UpdateEditorPreferencesRequest(true));

        assertThat(dto.selectionToolbarEnabled()).isTrue();
        assertThat(service.getPreferences().selectionToolbarEnabled()).isTrue();
    }

    private static final class TestContext {
        private final Map<String, EditorPreferencesEntity> store = new HashMap<>();
        private final EditorPreferencesRepository repository = mock(EditorPreferencesRepository.class);

        TestContext() {
            when(repository.findById(anyString())).thenAnswer(invocation -> {
                String id = invocation.getArgument(0);
                return Optional.ofNullable(store.get(id));
            });
            when(repository.save(any(EditorPreferencesEntity.class))).thenAnswer(invocation -> {
                EditorPreferencesEntity entity = invocation.getArgument(0);
                store.put(entity.getId(), entity);
                return entity;
            });
        }

        EditorPreferencesService service() {
            return new EditorPreferencesService(repository);
        }

        boolean contains(String id) {
            return store.containsKey(id);
        }
    }
}
