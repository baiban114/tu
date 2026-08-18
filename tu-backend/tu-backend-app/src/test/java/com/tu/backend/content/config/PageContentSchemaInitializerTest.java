package com.tu.backend.content.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

class PageContentSchemaInitializerTest {

    @Test
    void testEnsureSchema_whenMysqlTextColumn_thenUpgradeToLongtext() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(
            "select count(*) from information_schema.tables "
                + "where table_schema = database() and table_name = ?",
            Integer.class,
            "page_content"
        )).thenReturn(1);
        when(jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = database() and table_name = ? and column_name = ?",
            String.class,
            "page_content",
            "blocks_json"
        )).thenReturn("text");

        PageContentSchemaInitializer initializer = new PageContentSchemaInitializer(jdbcTemplate);
        initializer.ensureSchema("mysql");

        verify(jdbcTemplate).execute(
            "alter table page_content modify column blocks_json longtext not null"
        );
    }

    @Test
    void testEnsureSchema_whenMysqlAlreadyLongtext_thenSkipAlter() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(
            "select count(*) from information_schema.tables "
                + "where table_schema = database() and table_name = ?",
            Integer.class,
            "page_content"
        )).thenReturn(1);
        when(jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = database() and table_name = ? and column_name = ?",
            String.class,
            "page_content",
            "blocks_json"
        )).thenReturn("longtext");

        PageContentSchemaInitializer initializer = new PageContentSchemaInitializer(jdbcTemplate);
        initializer.ensureSchema("mysql");

        verify(jdbcTemplate, never()).execute(
            "alter table page_content modify column blocks_json longtext not null"
        );
    }

    @Test
    void testEnsureSchema_whenPostgresqlNonTextColumn_thenUpgradeToText() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(
            "select count(*) from information_schema.tables "
                + "where table_schema = current_schema() and table_name = ?",
            Integer.class,
            "page_content"
        )).thenReturn(1);
        when(jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = current_schema() and table_name = ? and column_name = ?",
            String.class,
            "page_content",
            "blocks_json"
        )).thenReturn("character varying");

        PageContentSchemaInitializer initializer = new PageContentSchemaInitializer(jdbcTemplate);
        initializer.ensureSchema("postgresql");

        verify(jdbcTemplate).execute(
            "alter table page_content alter column blocks_json type text"
        );
    }

    @Test
    void testEnsureSchema_whenPostgresqlAlreadyText_thenSkipAlter() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(
            "select count(*) from information_schema.tables "
                + "where table_schema = current_schema() and table_name = ?",
            Integer.class,
            "page_content"
        )).thenReturn(1);
        when(jdbcTemplate.queryForObject(
            "select data_type from information_schema.columns "
                + "where table_schema = current_schema() and table_name = ? and column_name = ?",
            String.class,
            "page_content",
            "blocks_json"
        )).thenReturn("text");

        PageContentSchemaInitializer initializer = new PageContentSchemaInitializer(jdbcTemplate);
        initializer.ensureSchema("postgresql");

        verify(jdbcTemplate, never()).execute(
            "alter table page_content alter column blocks_json type text"
        );
    }

    @Test
    void testBeanCreation_whenJdbcTemplateAvailable_thenInitializerCreated() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.register(PageContentSchemaInitializer.class);
            context.refresh();

            assertThat(context.getBean(PageContentSchemaInitializer.class)).isNotNull();
        }
    }
}
