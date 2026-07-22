package com.tu.backend.knowledgerelation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KnowledgePointTitleNormalizerTest {

    @Test
    void stripsArabicOutlinePrefixes() {
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("1. 绪论")).isEqualTo("绪论");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("1、数据结构")).isEqualTo("数据结构");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("1.1 数组")).isEqualTo("数组");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("(1) 概念")).isEqualTo("概念");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("（2）方法")).isEqualTo("方法");
    }

    @Test
    void stripsChineseAndCircledOrdinals() {
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("一、基础")).isEqualTo("基础");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("（一）概述")).isEqualTo("概述");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("第1章 导论")).isEqualTo("导论");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("第一章 导论")).isEqualTo("导论");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("① 准备")).isEqualTo("准备");
    }

    @Test
    void keepsTitleWhenOrdinalIsWholeName() {
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("第一章")).isEqualTo("第一章");
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("1.")).isEqualTo("1.");
    }

    @Test
    void doesNotStripNonOrdinalLeadingDigits() {
        assertThat(KnowledgePointTitleNormalizer.stripOrdinalPrefix("2024 年度总结")).isEqualTo("2024 年度总结");
    }

    @Test
    void fromContentFallsBackWhenEmpty() {
        assertThat(KnowledgePointTitleNormalizer.fromContent("")).isEqualTo("未命名知识点");
        assertThat(KnowledgePointTitleNormalizer.fromContent("2. 排序")).isEqualTo("排序");
    }
}
