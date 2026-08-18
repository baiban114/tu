package com.tu.backend.content.config;

import java.sql.DatabaseMetaData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ensures page JSON storage can hold large canvas snapshots and operation history.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class PageContentSchemaInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PageContentSchemaInitializer.class);
    private static final String TABLE_NAME = "page_content";
    private static final String COLUMN_NAME = "blocks_json";
    private static final String MYSQL_LARGE_TEXT_TYPE = "longtext";
    private static final String POSTGRESQL_LARGE_TEXT_TYPE = "text";

    private final JdbcTemplate jdbcTemplate;

    public PageContentSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        String database = databaseProductName();
        try {
            ensureSchema(database);
        } catch (Exception ex) {
            log.error("failed to ensure page content large text column", ex);
            throw ex;
        }
    }

    void ensureSchema(String database) {
        if (!tableExists(database)) {
            return;
        }
        if (isMysql(database)) {
            String actualType = mysqlColumnType();
            if (!MYSQL_LARGE_TEXT_TYPE.equalsIgnoreCase(actualType)) {
                jdbcTemplate.execute(
                    "alter table page_content modify column blocks_json longtext not null"
                );
                log.info("upgraded page_content.blocks_json to longtext");
            }
            return;
        }
        if (database.contains("postgresql")) {
            String actualType = postgresqlColumnType();
            if (!POSTGRESQL_LARGE_TEXT_TYPE.equalsIgnoreCase(actualType)) {
                jdbcTemplate.execute(
                    "alter table page_content alter column blocks_json type text"
                );
                log.info("upgraded page_content.blocks_json to text");
            }
        }
    }

    private String databaseProductName() {
        return jdbcTemplate.execute((ConnectionCallback<String>) connection -> {
            DatabaseMetaData metaData = connection.getMetaData();
            return metaData.getDatabaseProductName().toLowerCase();
        });
    }

    private boolean tableExists(String database) {
        Integer count;
        if (isMysql(database)) {
            count = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables "
                    + "where table_schema = database() and table_name = ?",
                Integer.class,
                TABLE_NAME
            );
        } else if (database.contains("postgresql")) {
            count = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables "
                    + "where table_schema = current_schema() and table_name = ?",
                Integer.class,
                TABLE_NAME
            );
        } else {
            return false;
        }
        return count != null && count > 0;
    }

    private String mysqlColumnType() {
        return jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = database() and table_name = ? and column_name = ?",
            String.class,
            TABLE_NAME,
            COLUMN_NAME
        );
    }

    private String postgresqlColumnType() {
        return jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = current_schema() and table_name = ? and column_name = ?",
            String.class,
            TABLE_NAME,
            COLUMN_NAME
        );
    }

    private boolean isMysql(String database) {
        return database.contains("mysql") || database.contains("mariadb");
    }
}
