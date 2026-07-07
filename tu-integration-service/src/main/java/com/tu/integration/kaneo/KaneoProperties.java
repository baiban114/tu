package com.tu.integration.kaneo;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "kaneo")
public class KaneoProperties {

    private String baseUrl = "http://localhost:11337";
    private String apiKey = "";
    private String workspaceId = "";

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getWorkspaceId() {
        return workspaceId;
    }

    public void setWorkspaceId(String workspaceId) {
        this.workspaceId = workspaceId;
    }

    public boolean configured() {
        return baseUrl != null && !baseUrl.isBlank()
            && apiKey != null && !apiKey.isBlank()
            && workspaceId != null && !workspaceId.isBlank();
    }
}
