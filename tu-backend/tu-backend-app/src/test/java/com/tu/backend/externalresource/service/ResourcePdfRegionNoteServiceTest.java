package com.tu.backend.externalresource.service;

import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.dto.CreateResourcePdfRegionNoteRequest;
import com.tu.backend.externalresource.entity.ResourceItemEntity;
import com.tu.backend.externalresource.entity.ResourcePdfRegionNoteEntity;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.externalresource.repository.ResourcePdfRegionNoteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResourcePdfRegionNoteServiceTest {

    @Mock
    private ResourceItemRepository itemRepository;
    @Mock
    private ResourcePdfRegionNoteRepository noteRepository;

    private ResourcePdfRegionNoteService service;

    @BeforeEach
    void setUp() {
        service = new ResourcePdfRegionNoteService(itemRepository, noteRepository);
    }

    @Test
    void createPersistsRegionNote() {
        ResourceItemEntity item = new ResourceItemEntity();
        item.setId("ri-1");
        when(itemRepository.findById("ri-1")).thenReturn(Optional.of(item));
        when(noteRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var dto = service.create("ri-1", new CreateResourcePdfRegionNoteRequest(
            3, 5, 0.2, 0.8, "hello", "file-1", "#FFE082"
        ));

        ArgumentCaptor<ResourcePdfRegionNoteEntity> captor = ArgumentCaptor.forClass(ResourcePdfRegionNoteEntity.class);
        verify(noteRepository).save(captor.capture());
        ResourcePdfRegionNoteEntity saved = captor.getValue();
        assertTrue(saved.getId().startsWith("rpn-"));
        assertEquals("ri-1", saved.getResourceItemId());
        assertEquals(3, saved.getStartPage());
        assertEquals(5, saved.getEndPage());
        assertEquals(0.2, saved.getClipTop());
        assertEquals(0.8, saved.getClipBottom());
        assertEquals("hello", dto.note());
    }

    @Test
    void createRejectsMissingItem() {
        when(itemRepository.findById("missing")).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.create(
            "missing",
            new CreateResourcePdfRegionNoteRequest(1, 1, 0d, 1d, "n", null, null)
        ));
    }

    @Test
    void listReturnsOrderedNotes() {
        ResourceItemEntity item = new ResourceItemEntity();
        item.setId("ri-1");
        when(itemRepository.findById("ri-1")).thenReturn(Optional.of(item));
        ResourcePdfRegionNoteEntity note = new ResourcePdfRegionNoteEntity();
        note.setId("rpn-1");
        note.setResourceItemId("ri-1");
        note.setStartPage(1);
        note.setEndPage(1);
        note.setClipTop(0d);
        note.setClipBottom(1d);
        note.setNote("n");
        when(noteRepository.findByResourceItemIdOrderByStartPageAscCreatedAtAsc("ri-1"))
            .thenReturn(List.of(note));

        assertEquals(1, service.listByResourceItem("ri-1").size());
    }
}
