package com.tu.integration.generic;

import java.util.List;
import java.util.Map;

public record GenericRestProfile(
    String provider,
    Map<String, Operation> operations,
    Map<String, Map<String, String>> enumMappings,
    Boolean omitBlank
) {
    public record Operation(
        String method,
        String path,
        Map<String, String> query,
        Map<String, String> body,
        Map<String, String> defaults,
        String arrayPath,
        Map<String, List<String>> fields
    ) {
    }
}
