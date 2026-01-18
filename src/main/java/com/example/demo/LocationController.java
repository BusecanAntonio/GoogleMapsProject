package com.example.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/locations")
public class LocationController {

    @Autowired
    private LocationRepository repository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @GetMapping
    public List<Location> getAllLocations() {
        return repository.findAll();
    }

    @PostMapping
    public Location addLocation(@RequestBody Location location) {
        Location saved = repository.save(location);
        // Trimitem notificare: { action: "add", type: "location", data: ... }
        messagingTemplate.convertAndSend("/topic/updates", Map.of(
            "action", "add",
            "type", "location",
            "data", saved
        ));
        return saved;
    }

    @DeleteMapping("/{id}")
    public void deleteLocation(@PathVariable Long id) {
        repository.deleteById(id);
        // Trimitem notificare: { action: "delete", type: "location", id: ... }
        messagingTemplate.convertAndSend("/topic/updates", Map.of(
            "action", "delete",
            "type", "location",
            "id", id
        ));
    }
}
