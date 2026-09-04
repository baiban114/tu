package com.tu.backend.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tu.backend.auth.security.CurrentUserIdResolver;
import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledge.entity.KnowledgeBaseEntity;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import java.util.Optional;
import java.util.List;
import org.junit.jupiter.api.Test;

class KnowledgeBaseAccessServiceTest {

    @Test
    void allowsOwnerAndRejectsAnotherUser() {
        KnowledgeBaseRepository repository = mock(KnowledgeBaseRepository.class);
        CurrentUserIdResolver resolver = mock(CurrentUserIdResolver.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setId("kb-1");
        knowledgeBase.setOwnerUserId("user-1");
        when(repository.findById("kb-1")).thenReturn(Optional.of(knowledgeBase));
        when(resolver.resolve()).thenReturn("user-1");
        KnowledgeBaseAccessService service = new KnowledgeBaseAccessService(repository, resolver);

        assertThat(service.requireAccessible("kb-1")).isSameAs(knowledgeBase);

        when(resolver.resolve()).thenReturn("user-2");
        assertThatThrownBy(() -> service.requireAccessible("kb-1"))
            .isInstanceOf(BusinessException.class)
            .hasMessage("knowledge base is not accessible to current user");
    }

    @Test
    void allowsLegacyKnowledgeBaseOnlyForLocalUser() {
        KnowledgeBaseRepository repository = mock(KnowledgeBaseRepository.class);
        CurrentUserIdResolver resolver = mock(CurrentUserIdResolver.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setId("kb-legacy");
        when(repository.findById("kb-legacy")).thenReturn(Optional.of(knowledgeBase));
        when(resolver.resolve()).thenReturn(CurrentUserIdResolver.LOCAL_USER_ID);
        when(resolver.isLocalUser(CurrentUserIdResolver.LOCAL_USER_ID)).thenReturn(true);
        KnowledgeBaseAccessService service = new KnowledgeBaseAccessService(repository, resolver);

        assertThat(service.requireAccessible("kb-legacy")).isSameAs(knowledgeBase);
    }

    @Test
    void listsOnlyOwnedKnowledgeBasesAndLocalLegacyData() {
        KnowledgeBaseRepository repository = mock(KnowledgeBaseRepository.class);
        CurrentUserIdResolver resolver = mock(CurrentUserIdResolver.class);
        KnowledgeBaseEntity owned = new KnowledgeBaseEntity();
        owned.setId("kb-owned");
        KnowledgeBaseEntity legacy = new KnowledgeBaseEntity();
        legacy.setId("kb-legacy");
        when(resolver.resolve()).thenReturn(CurrentUserIdResolver.LOCAL_USER_ID);
        when(resolver.isLocalUser(CurrentUserIdResolver.LOCAL_USER_ID)).thenReturn(true);
        when(repository.findByOwnerUserIdOrderByUpdatedAtDesc(CurrentUserIdResolver.LOCAL_USER_ID))
            .thenReturn(List.of(owned));
        when(repository.findByOwnerUserIdIsNullOrderByUpdatedAtDesc()).thenReturn(List.of(legacy));
        KnowledgeBaseAccessService service = new KnowledgeBaseAccessService(repository, resolver);

        assertThat(service.listAccessible()).containsExactly(owned, legacy);
    }

    @Test
    void testListAccessible_whenUserIdProvided_doesNotResolveRequestIdentity() {
        KnowledgeBaseRepository repository = mock(KnowledgeBaseRepository.class);
        CurrentUserIdResolver resolver = mock(CurrentUserIdResolver.class);
        when(repository.findByOwnerUserIdOrderByUpdatedAtDesc("user-1")).thenReturn(List.of());
        KnowledgeBaseAccessService service = new KnowledgeBaseAccessService(repository, resolver);

        assertThat(service.listAccessible("user-1")).isEmpty();
        verify(resolver, never()).resolve();
    }
}
