package org.zhitui.tu.service;

import org.zhitui.tu.core.exception.ServiceException;
import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.entity.Sponsor;

/**
 * @author ronger
 */
public interface SponsorService extends Service<Sponsor> {
    /**
     * 赞赏
     *
     * @param sponsor
     * @return
     * @throws ServiceException
     */
    boolean sponsorship(Sponsor sponsor) throws ServiceException;
}
