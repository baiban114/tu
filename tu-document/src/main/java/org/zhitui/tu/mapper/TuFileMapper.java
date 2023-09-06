package org.zhitui.tu.mapper;

import org.zhitui.tu.core.mapper.Mapper;
import org.zhitui.tu.entity.TuFile;
import org.apache.ibatis.annotations.Param;

/**
 * @author caterpillar
 * @date 2022-1-12 22:33:16
 */
public interface TuFileMapper extends Mapper<TuFile> {

    /**
     * 通过md5获取文件访问链接
     *
     * @param md5Value  md5值
     * @param createdBy 创建人
     * @param createdBy 创建人
     * @param fileType  文件类型
     */
    String getFileUrlByMd5(@Param("md5Value") String md5Value, @Param("createdBy") long createdBy, @Param("fileType") String fileType);

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
    int insertTuFile(@Param("fileUrl") String fileUrl, @Param("filePath") String filePath, @Param("md5Value") String md5Value, @Param("createdBy") long createdBy, @Param("fileSize") long fileSize, @Param("fileType") String fileType);

}
