package com.example.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/locations")
public class LocationController {

    @Autowired
    private LocationRepository repository;

    @GetMapping
    public List<Location> getAllLocations() {
        return repository.findAll();
    }

    @PostMapping
    public Location addLocation(@RequestBody Location location) {
        System.out.println("Saving location to MySQL: " + location.getName() + " [" + location.getLat() + ", " + location.getLng() + "]");
        return repository.save(location);
    }
}
