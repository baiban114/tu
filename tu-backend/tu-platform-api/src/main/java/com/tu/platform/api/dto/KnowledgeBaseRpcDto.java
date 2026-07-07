package com.tu.platform.api.dto;

import java.io.Serializable;

public class KnowledgeBaseRpcDto implements Serializable {

    private static final long serialVersionUID = 1L;

    private String id;
    private String name;
    private String icon;
    private String description;

    public KnowledgeBaseRpcDto() {
    }

    public KnowledgeBaseRpcDto(String id, String name, String icon, String description) {
        this.id = id;
        this.name = name;
        this.icon = icon;
        this.description = description;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
