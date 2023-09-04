package com.run.tu.controller.open;

import com.run.tu.core.result.GlobalResult;
import com.run.tu.core.result.GlobalResultGenerator;
import com.run.tu.dto.admin.Dashboard;
import com.run.tu.service.OpenDataService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import java.util.Map;

/**
 * Created on 2022/3/14 13:49.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName com.run.tu.web.api.open
 */
@RestController
@RequestMapping("/api/v1/open-data")
public class OpenDataController {

    @Resource
    private OpenDataService openDataService;

    @GetMapping("/dashboard")
    public GlobalResult dashboard() {
        Dashboard dashboard = openDataService.dashboard();
        return GlobalResultGenerator.genSuccessResult(dashboard);
    }

    @GetMapping("/last-thirty-days")
    public GlobalResult LastThirtyDaysData() {
        Map map = openDataService.lastThirtyDaysData();
        return GlobalResultGenerator.genSuccessResult(map);
    }

}
