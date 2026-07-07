package com.tu.integration.kaneo;

public record KaneoConnection(
    String baseUrl,
    String apiKey,
    String workspaceId
) {

    public boolean configured() {
        return baseUrl != null && !baseUrl.isBlank()
            && apiKey != null && !apiKey.isBlank()
            && workspaceId != null && !workspaceId.isBlank();
    }
}
