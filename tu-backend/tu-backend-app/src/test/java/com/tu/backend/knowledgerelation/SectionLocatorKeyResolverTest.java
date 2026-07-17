package com.tu.backend.knowledgerelation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SectionLocatorKeyResolverTest {

    @Test
    void resolvesKeysAlignedWithFrontendSectionMetadata() {
        assertThat(SectionLocatorKeyResolver.resolve("h-10", "hs-abc", "local"))
            .isEqualTo("local:hs-abc");
        assertThat(SectionLocatorKeyResolver.resolve("ref-group-b1", "b1", "ref-group"))
            .isEqualTo("ref-group:b1");
        assertThat(SectionLocatorKeyResolver.resolve("ctn-1", "b1", "ref-child", "ctn-1"))
            .isEqualTo("ref-child:b1:ctn-1");
        assertThat(SectionLocatorKeyResolver.resolve("ref-child-b1-0", "b1", "ref-child", null))
            .isEqualTo("ref-child-b1-0");
    }
}
