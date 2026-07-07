package com.tu.integration.generic;

public record GenericRestConnection(
    String baseUrl,
    String apiKey,
    String workspaceId,
    String adapterProfileJson
) {
    public boolean configured() {
        return baseUrl != null && !baseUrl.isBlank()
            && apiKey != null && !apiKey.isBlank()
            && workspaceId != null && !workspaceId.isBlank();
    }
}
