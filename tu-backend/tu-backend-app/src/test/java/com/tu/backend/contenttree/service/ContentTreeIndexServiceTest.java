package com.tu.backend.contenttree.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.tu.backend.contenttree.search.HeadingSearchIndexService;
import com.tu.backend.index.IndexProperties;
import com.tu.backend.page.repository.PageRepository;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class ContentTreeIndexServiceTest {

    @Mock
    private ContentTreeNodeService contentTreeNodeService;

    @Mock
    private PageRepository pageRepository;

    @Mock
    private HeadingSearchIndexService headingSearchIndexService;

    private IndexProperties indexProperties;
    private ContentTreeIndexService service;

    @BeforeEach
    void setUp() {
        indexProperties = new IndexProperties();
        indexProperties.setFingerprintEnabled(false);
        service = new ContentTreeIndexService(
            contentTreeNodeService,
            pageRepository,
            headingSearchIndexService,
            indexProperties
        );
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void rebuildPageBestEffortRunsImmediatelyWithoutTransaction() {
        service.rebuildPageBestEffort("p-1", "fp-1");

        verify(contentTreeNodeService, times(1)).rebuildPageOutline("p-1", "fp-1");
        verify(headingSearchIndexService, times(1)).indexPageBestEffort("p-1");
    }

    @Test
    void rebuildPageBestEffortDefersUntilAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();

        service.rebuildPageBestEffort("p-1", "fp-1");

        verify(contentTreeNodeService, never()).rebuildPageOutline(any(), any());
        verifyNoInteractions(headingSearchIndexService);

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(contentTreeNodeService, times(1)).rebuildPageOutline("p-1", "fp-1");
        verify(headingSearchIndexService, times(1)).indexPageBestEffort("p-1");
    }

    @Test
    void rebuildPageBestEffortSwallowsRebuildFailureAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();
        org.mockito.Mockito.doThrow(new RuntimeException("duplicate"))
            .when(contentTreeNodeService)
            .rebuildPageOutline(eq("p-1"), any());

        service.rebuildPageBestEffort("p-1", "fp-1");
        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(contentTreeNodeService, times(1)).rebuildPageOutline("p-1", "fp-1");
        verify(headingSearchIndexService, never()).indexPageBestEffort(any());
    }

    @Test
    void deletePagesBestEffortDefersUntilAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();
        List<String> pageIds = List.of("p-1", "p-2");

        service.deletePagesBestEffort(pageIds);

        verify(contentTreeNodeService, never()).deletePageOutlines(any());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(contentTreeNodeService, times(1)).deletePageOutlines(pageIds);
        verify(headingSearchIndexService, times(1)).deletePagesBestEffort(pageIds);
    }
}
