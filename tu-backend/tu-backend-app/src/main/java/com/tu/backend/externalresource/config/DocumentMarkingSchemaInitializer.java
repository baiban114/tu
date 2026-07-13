package com.tu.backend.externalresource.config;

import java.sql.DatabaseMetaData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DocumentMarkingSchemaInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DocumentMarkingSchemaInitializer.class);

    private final JdbcTemplate jdbcTemplate;

    public DocumentMarkingSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            String database = databaseProductName();
            if (!tableExists(database, "external_resource_excerpt")) {
                return;
            }
            if (!columnExists(database, "external_resource_excerpt", "metadata_json")) {
                if (database.contains("mysql") || database.contains("mariadb")) {
                    jdbcTemplate.execute("alter table external_resource_excerpt add column metadata_json text null");
                } else if (database.contains("postgresql")) {
                    jdbcTemplate.execute("alter table external_resource_excerpt add column metadata_json text null");
                } else if (database.contains("h2")) {
                    jdbcTemplate.execute("alter table external_resource_excerpt add column metadata_json text null");
                }
                log.info("added external_resource_excerpt.metadata_json column");
            }
        } catch (Exception ex) {
            log.warn("failed to ensure document marking schema", ex);
        }
    }

    private String databaseProductName() {
        return jdbcTemplate.execute((ConnectionCallback<String>) (connection) -> {
            DatabaseMetaData metaData = connection.getMetaData();
            return metaData.getDatabaseProductName().toLowerCase();
        });
    }

    private boolean tableExists(String database, String tableName) {
        try {
            Integer count;
            if (database.contains("mysql") || database.contains("mariadb")) {
                count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.tables where table_schema = database() and table_name = ?",
                    Integer.class,
                    tableName
                );
            } else if (database.contains("postgresql")) {
                count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.tables where table_schema = current_schema() and table_name = ?",
                    Integer.class,
                    tableName
                );
            } else if (database.contains("h2")) {
                count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.tables where lower(table_name) = ?",
                    Integer.class,
                    tableName.toLowerCase()
                );
            } else {
                return false;
            }
            return count != null && count > 0;
        } catch (Exception ex) {
            return false;
        }
    }

    private boolean columnExists(String database, String tableName, String column) {
        try {
            Integer count;
            if (database.contains("mysql") || database.contains("mariadb")) {
                count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = ?",
                    Integer.class,
                    tableName,
                    column
                );
            } else if (database.contains("postgresql")) {
                count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.columns where table_schema = current_schema() and table_name = ? and column_name = ?",
                    Integer.class,
                    tableName,
                    column
                );
            } else if (database.contains("h2")) {
                count = jdbcTemplate.queryForObject(
                    "select count(*) from information_schema.columns where lower(table_name) = ? and lower(column_name) = ?",
                    Integer.class,
                    tableName.toLowerCase(),
                    column.toLowerCase()
                );
            } else {
                return false;
            }
            return count != null && count > 0;
        } catch (Exception ex) {
            return false;
        }
    }
}
