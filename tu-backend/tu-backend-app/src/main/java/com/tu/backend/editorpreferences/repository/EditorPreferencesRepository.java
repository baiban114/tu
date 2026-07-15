package com.tu.backend.editorpreferences.repository;

import com.tu.backend.editorpreferences.entity.EditorPreferencesEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EditorPreferencesRepository extends JpaRepository<EditorPreferencesEntity, String> {
}
