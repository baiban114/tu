package com.tu.backend.ai.documentmarking;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.tu.backend.knowledgerelation.entity.KnowledgeRelationEntity;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class DocumentMarkingContextCollectorTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void collectsUserHeadingAndBasisAsProtected() throws Exception {
        String json = """
            [{
              "id": "page-content",
              "type": "richtext",
              "document": {
                "type": "doc",
                "content": [{
                  "type": "heading",
                  "attrs": {
                    "blockId": "h1",
                    "level": 2,
                    "sourceBinding": {
                      "resourceItemId": "ri-1",
                      "resourceExcerptId": "re-1",
                      "snapshot": { "resourceTitle": "Book", "excerptTitle": "Ch1" }
                    }
                  },
                  "content": [{ "type": "text", "text": "Intro" }]
                }]
              },
              "metadata": {
                "annotations": [{
                  "id": "ann-1",
                  "kind": "basis",
                  "selectedText": "evidence",
                  "basisBinding": {
                    "resourceItemId": "ri-2",
                    "resourceExcerptId": "re-2",
                    "snapshot": { "resourceTitle": "Paper" }
                  }
                }]
              }
            }]
            """;
        ArrayNode blocks = (ArrayNode) objectMapper.readTree(json);

        List<DocumentMarkingContextCollector.ProtectedLocatorEntry> protectedEntries =
            DocumentMarkingContextCollector.collectProtected("page-1", blocks, List.of(), Set.of());

        assertThat(protectedEntries).hasSize(2);
        assertThat(protectedEntries.get(0).locator()).isEqualTo("page:page-1:heading:h1");
        assertThat(protectedEntries.get(1).locator()).isEqualTo("page:page-1:annotation:ann-1");
    }

    @Test
    void skipsAiMarkers() throws Exception {
        String json = """
            [{
              "id": "page-content",
              "type": "richtext",
              "document": {
                "type": "doc",
                "content": [{
                  "type": "heading",
                  "attrs": {
                    "blockId": "h-ai",
                    "level": 2,
                    "sourceBinding": {
                      "resourceItemId": "ri-1",
                      "resourceExcerptId": "re-1",
                      "markerSource": "ai",
                      "snapshot": { "resourceTitle": "Book" }
                    }
                  },
                  "content": [{ "type": "text", "text": "AI" }]
                }]
              },
              "metadata": { "annotations": [] }
            }]
            """;
        ArrayNode blocks = (ArrayNode) objectMapper.readTree(json);

        List<DocumentMarkingContextCollector.ProtectedLocatorEntry> protectedEntries =
            DocumentMarkingContextCollector.collectProtected("page-1", blocks, List.of(), Set.of());

        assertThat(protectedEntries).isEmpty();
    }

    @Test
    void detectsLocatorOverlap() {
        Set<String> protectedSet = DocumentMarkingContextCollector.protectedLocatorSet(List.of(
            new DocumentMarkingContextCollector.ProtectedLocatorEntry(
                "page:p1:heading:h1", "heading", "H", null
            )
        ));
        assertThat(DocumentMarkingContextCollector.isLocatorProtected("page:p1:heading:h1", protectedSet)).isTrue();
        assertThat(DocumentMarkingContextCollector.isLocatorProtected("page:p1:heading:h2", protectedSet)).isFalse();
    }

    @Test
    void collectsUserRelationsOnPage() {
        KnowledgeRelationEntity relation = new KnowledgeRelationEntity();
        relation.setSourceProvenance("user");
        relation.setFromLocator("page:p1:annotation:a1");
        relation.setRelationTypeKey("case");
        relation.setNote("linked");

        List<DocumentMarkingContextCollector.ProtectedLocatorEntry> protectedEntries =
            DocumentMarkingContextCollector.collectProtected("p1", objectMapper.createArrayNode(), List.of(relation), Set.of());

        assertThat(protectedEntries).hasSize(1);
        assertThat(protectedEntries.getFirst().type()).isEqualTo("relation");
    }
}
