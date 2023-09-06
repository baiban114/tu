package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.entity.TuFile;
import org.zhitui.tu.mapper.TuFileMapper;
import org.zhitui.tu.service.TuFileService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

/**
 * @author caterpillar
 * @date 2022-1-12 22:34:55
 */
@Service
public class TuFileServiceImpl extends AbstractService<TuFile> implements TuFileService {

    @Resource
    private TuFileMapper tuFileMapper;


    /**
     * 通过md5获取文件访问链接
     *
     * @param md5Value  md5值
     * @param createdBy 用户id
     * @param fileType  文件类型
     * @return
     */
    @Override
    public String getFileUrlByMd5(String md5Value, long createdBy, String fileType) {
        return tuFileMapper.getFileUrlByMd5(md5Value, createdBy, fileType);
    }

    /**
     * 插入文件对象
     *
     * @param fileUrl   访问路径
     * @param filePath  上传路径
     * @param md5Value  md5值
     * @param createdBy 创建人
     * @param fileSize  文件大小
     * @param fileType  文件类型
     * @return
     */
    @Override
    public int insertTuFile(String fileUrl, String filePath, String md5Value, long createdBy, long fileSize, String fileType) {
        return tuFileMapper.insertTuFile(fileUrl, filePath, md5Value, createdBy, fileSize, fileType);
    }
}
