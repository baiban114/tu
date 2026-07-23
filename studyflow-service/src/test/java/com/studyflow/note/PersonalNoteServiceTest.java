package com.studyflow.note;

import com.studyflow.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PersonalNoteServiceTest {

    @Mock
    private PersonalNoteRepository repository;

    private PersonalNoteService service;

    @BeforeEach
    void setUp() {
        service = new PersonalNoteService(repository);
    }

    @Test
    void createTrimsBodyAndPersists() {
        PersonalNote created = service.create("u1", "  hello note  ");

        ArgumentCaptor<PersonalNote> captor = ArgumentCaptor.forClass(PersonalNote.class);
        verify(repository).insert(captor.capture());
        assertEquals("hello note", captor.getValue().body());
        assertEquals("u1", captor.getValue().userId());
        assertEquals("hello note", created.body());
    }

    @Test
    void createRejectsBlankBody() {
        assertThrows(BusinessException.class, () -> service.create("u1", "   "));
    }

    @Test
    void listUsesDefaultPageSizeWhenInvalid() {
        when(repository.countByUserId("local")).thenReturn(1L);
        when(repository.findByUserId(eq("local"), eq(10), eq(0)))
                .thenReturn(List.of(sampleNote()));

        PersonalNotePage page = service.list(null, -1, 0);

        assertEquals(0, page.page());
        assertEquals(10, page.pageSize());
        assertEquals(1, page.items().size());
        verify(repository).findByUserId("local", 10, 0);
    }

    @Test
    void updateThrowsWhenMissing() {
        when(repository.updateBody(eq("missing"), eq("u1"), eq("x"), any(OffsetDateTime.class)))
                .thenReturn(false);

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> service.update("u1", "missing", "x")
        );
        assertTrue(ex.getMessage().contains("not found"));
    }

    @Test
    void getReturnsNote() {
        when(repository.findByIdAndUserId("n1", "u1")).thenReturn(Optional.of(sampleNote()));
        PersonalNote note = service.get("u1", "n1");
        assertEquals("n1", note.id());
    }

    private static PersonalNote sampleNote() {
        OffsetDateTime now = OffsetDateTime.parse("2026-07-23T10:00:00Z");
        return new PersonalNote("n1", "u1", "body", now, now);
    }
}
