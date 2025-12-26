package com.example.demo;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private String type; // Ex: "cafe", "police", "blocked"
    private Double lat;
    private Double lng;

    // Getters and setters
    public Long getId() { return id; }
    public String getName() { return name; }
    public String getType() { return type; }
    public Double getLat() { return lat; }
    public Double getLng() { return lng; }

    public void setName(String name) { this.name = name; }
    public void setType(String type) { this.type = type; }
    public void setLat(Double lat) { this.lat = lat; }
    public void setLng(Double lng) { this.lng = lng; }
}
