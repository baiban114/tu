package com.run.tu.service;

import com.run.tu.core.exception.ServiceException;
import com.run.tu.core.service.Service;
import com.run.tu.entity.Sponsor;

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
