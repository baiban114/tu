package org.zhitui.tu.service;

import org.zhitui.tu.base.BaseServiceTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TuFileServiceTest extends BaseServiceTest {

    private final String fileUrl = "localhost/upload/file/123.jpg";
    private final String filePath = "upload/file/123.jpg";
    private final String md5Value = "md5Value";
    private final long createdBy = 1L;
    private final long fileSize = 1024L;
    private final String fileType = "jpg";

    @Autowired
    private TuFileService tuFileService;

    @BeforeEach
    void setUp() {
        tuFileService.insertTuFile(fileUrl, filePath, md5Value, createdBy, fileSize, fileType);
    }

    @Test
    @DisplayName("通过md5获取文件访问链接")
    void getFileUrlByMd5() {
        String fileUrlByMd5 = tuFileService.getFileUrlByMd5(md5Value, createdBy, fileType);
        assertEquals(fileUrl, fileUrlByMd5);
    }

    @Test
    @DisplayName("插入文件对象")
    void insertTuFile() {
        int i = tuFileService.insertTuFile(fileUrl, filePath, md5Value, createdBy, fileSize, fileType);
        assertEquals(1, i);
    }
}