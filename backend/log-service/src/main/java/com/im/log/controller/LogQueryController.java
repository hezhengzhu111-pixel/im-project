package com.im.log.controller;


import com.im.dto.ApiResponse;
import com.im.log.entity.LogDocument;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.query.Criteria;
import org.springframework.data.elasticsearch.core.query.CriteriaQuery;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/logs")
public class LogQueryController {

    private final ElasticsearchOperations elasticsearchOperations;

    public LogQueryController(ElasticsearchOperations elasticsearchOperations) {
        this.elasticsearchOperations = elasticsearchOperations;
    }

    @GetMapping("/query")
    public ApiResponse<List<LogDocument>> queryLogs(
            @RequestParam(required = false) String traceId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {

        try {
            Criteria criteria = new Criteria();
            if (StringUtils.hasText(traceId)) {
                criteria.and(new Criteria("traceId").is(traceId));
            }
            if (StringUtils.hasText(level)) {
                criteria.and(new Criteria("level").is(level));
            }
            if (StringUtils.hasText(keyword)) {
                criteria.and(new Criteria("message").contains(keyword));
            }

            CriteriaQuery query = new CriteriaQuery(criteria);
            query.setPageable(PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "timestamp")));

            SearchHits<LogDocument> searchHits = elasticsearchOperations.search(query, LogDocument.class);
            List<LogDocument> logs = searchHits.getSearchHits().stream()
                    .map(SearchHit::getContent)
                    .collect(Collectors.toList());
            return ApiResponse.success(logs);

        } catch (Exception e) {
            // Fallback to local files
            return ApiResponse.success(fallbackQuery(traceId, level, keyword, page, size));
        }
    }

    private List<LogDocument> fallbackQuery(String traceId, String level, String keyword, int page, int size) {
        List<LogDocument> results = new ArrayList<>();
        Path logDir = Paths.get("/var/log/im-project");
        if (!Files.exists(logDir)) {
            return results;
        }
        
        try (Stream<Path> paths = Files.walk(logDir)) {
            List<Path> files = paths.filter(Files::isRegularFile)
                    .filter(p -> p.toString().endsWith(".log"))
                    .collect(Collectors.toList());

            int skip = page * size;
            int count = 0;

            for (Path file : files) {
                try (BufferedReader reader = new BufferedReader(new FileReader(file.toFile()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (StringUtils.hasText(traceId) && !line.contains(traceId)) continue;
                        if (StringUtils.hasText(level) && !line.contains(level)) continue;
                        if (StringUtils.hasText(keyword) && !line.contains(keyword)) continue;

                        if (count >= skip) {
                            LogDocument doc = new LogDocument();
                            doc.setMessage(line);
                            results.add(doc);
                            if (results.size() >= size) {
                                return results;
                            }
                        }
                        count++;
                    }
                }
            }
        } catch (IOException ex) {
            // ignore
        }
        return results;
    }
}
