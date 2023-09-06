package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.entity.TuFile;


/**
 * 文件服务记录
 *
 * @author caterpillar
 * @date 2022-1-12 22:32:49
 */
public interface TuFileService extends Service<TuFile> {

    /**
     * 通过md5获取文件访问链接
     *
     * @param md5Value  md5值
     * @param createdBy 用户id
     * @param fileType  文件类型
     * @return
     */
    String getFileUrlByMd5(String md5Value, long createdBy, String fileType);

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
    int insertTuFile(String fileUrl, String filePath, String md5Value, long createdBy, long fileSize, String fileType);
}
