package com.run.tu.dto.admin;

import com.run.tu.dto.Author;
import lombok.Data;

/**
 * @author ronger
 */
@Data
public class TagDTO {

    private Integer idTag;

    private String tagTitle;

    private String tagUri;

    private String tagDescription;

    private String tagIconPath;

    private Integer tagAuthorId;

    private Author tagAuthor;

}
