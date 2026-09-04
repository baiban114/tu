package com.tu.backend.rag;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties(prefix = "rag")
@Validated
public class RagProperties {

    private boolean enabled = true;

    @NotBlank
    private String serviceUrl = "http://localhost:19080";

    @NotNull
    private Duration timeout = Duration.ofSeconds(10);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getServiceUrl() {
        return serviceUrl;
    }

    public void setServiceUrl(String serviceUrl) {
        this.serviceUrl = serviceUrl;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }
}
