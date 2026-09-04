package com.tu.backend.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.DatabaseMetaData;
import java.util.List;

@Component
public class KnowledgeChatSchemaInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeChatSchemaInitializer.class);
    private static final String TABLE_NAME = "knowledge_chat_message";
    private static final List<String> LARGE_TEXT_COLUMNS = List.of("content", "reasoning_content", "sources_json");

    private final JdbcTemplate jdbcTemplate;

    public KnowledgeChatSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            String database = databaseProductName();
            if (database.contains("mysql") || database.contains("mariadb")) {
                for (String column : LARGE_TEXT_COLUMNS) {
                    if (shouldAlterColumn(column)) {
                        String nullability = "content".equals(column) ? " not null" : " null";
                        jdbcTemplate.execute(
                            "alter table " + TABLE_NAME + " modify column " + column + " longtext" + nullability
                        );
                    }
                }
            }
        } catch (Exception ex) {
            log.error("Failed to ensure knowledge chat large text columns", ex);
        }
    }

    private String databaseProductName() {
        return jdbcTemplate.execute((ConnectionCallback<String>) connection -> {
            DatabaseMetaData metaData = connection.getMetaData();
            return metaData.getDatabaseProductName().toLowerCase();
        });
    }

    private boolean shouldAlterColumn(String column) {
        String actualType = jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = database() and table_name = ? and column_name = ?",
            String.class,
            TABLE_NAME,
            column
        );
        return actualType == null || !"longtext".equalsIgnoreCase(actualType);
    }
}
