package com.tu.backend.contenttree.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionAttribute;

class ContentTreeNodeServiceTransactionTest {

    private final AnnotationTransactionAttributeSource attributeSource =
        new AnnotationTransactionAttributeSource();

    @Test
    void testAfterCommitOperations_whenTransactionAttributeResolved_thenRequireNewTransaction()
        throws NoSuchMethodException {
        assertRequiresNew("rebuildPageOutline", String.class, String.class);
        assertRequiresNew("getStoredFingerprint", String.class);
        assertRequiresNew("deletePageOutlines", List.class);
    }

    private void assertRequiresNew(String methodName, Class<?>... parameterTypes)
        throws NoSuchMethodException {
        Method method = ContentTreeNodeService.class.getMethod(methodName, parameterTypes);
        TransactionAttribute attribute = attributeSource.getTransactionAttribute(
            method,
            ContentTreeNodeService.class
        );

        assertThat(attribute).isNotNull();
        assertThat(attribute.getPropagationBehavior())
            .isEqualTo(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
}
