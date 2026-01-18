package com.example.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/roads")
public class RoadSectionController {

    @Autowired
    private RoadSectionRepository repository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @GetMapping
    public List<RoadSection> getAllRoads() {
        return repository.findAll();
    }

    @PostMapping
    public RoadSection addRoad(@RequestBody RoadSection road) {
        RoadSection saved = repository.save(road);
        messagingTemplate.convertAndSend("/topic/updates", Map.of(
            "action", "add",
            "type", "road",
            "data", saved
        ));
        return saved;
    }

    @DeleteMapping("/{id}")
    public void deleteRoad(@PathVariable Long id) {
        repository.deleteById(id);
        messagingTemplate.convertAndSend("/topic/updates", Map.of(
            "action", "delete",
            "type", "road",
            "id", id
        ));
    }
}
