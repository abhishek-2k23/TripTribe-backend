/**
 * Seed data for PlanTemplate: pre-made, India-first itineraries that users
 * browse and clone into a real trip.
 *
 * Activity places are NOT hard-coded to Google place IDs. Each activity carries
 * a `placeQuery` string, and `scripts/seed-templates.js --resolve` resolves it
 * to a Google place ID via Places Text Search at seed time. The model/app never
 * invents place IDs.
 *
 * All copy (titles, summaries, notes, costs, timings) is a first draft and must
 * be reviewed before launch. Costs are rough INR per-person figures.
 */

// Builds one activity object with the exact PlanTemplate activity shape.
const act = (section, time, title, type, placeQuery, durationMin, estCost, notes) => ({
  section,
  time,
  title,
  type,
  placeQuery,
  durationMin,
  estCost,
  notes,
});

export const TEMPLATES = [
  // ---------------------------------------------------------------- Goa
  {
    slug: "goa-4-days-beaches-and-old-goa",
    title: "Goa in 4 days: beaches, forts and Old Goa",
    summary:
      "North Goa beaches and clifftop forts, a day in Panjim's Latin Quarter and the churches of Old Goa, with time left for seafood and sunsets.",
    destination: { name: "Goa", query: "Goa, India", region: "Goa", country: "India" },
    days: 4,
    nights: 3,
    theme: "coast",
    budgetBand: "mid",
    estCostPerPerson: 14000,
    bestMonths: [11, 12, 1, 2, 3],
    tags: ["beaches", "forts", "seafood", "churches", "nightlife"],
    featured: true,
    itinerary: [
      {
        day: 1,
        title: "Arrive and Candolim sunset",
        activities: [
          act("Afternoon", "15:30", "Fort Aguada and lighthouse", "Sightseeing", "Fort Aguada, Candolim, Goa", 75, 50,
            "Go after 3 pm when the heat eases; the ramparts have little shade, so carry water."),
          act("Evening", "17:30", "Sunset at Candolim Beach", "Sightseeing", "Candolim Beach, Candolim, Goa", 90, 0,
            "Quieter than Baga and a short drive from the fort; shacks rent sunbeds if you order food."),
          act("Night", "20:00", "Goan seafood dinner at Britto's", "Food", "Britto's, Baga, Goa", 90, 900,
            "Long-running beachfront restaurant; expect a wait on weekends in peak season."),
        ],
      },
      {
        day: 2,
        title: "Chapora, Vagator and Anjuna",
        activities: [
          act("Morning", "08:30", "Chapora Fort viewpoint", "Sightseeing", "Chapora Fort, Chapora, Goa", 60, 0,
            "Short, steep walk up from the car park; go early for views over Vagator before it gets hot."),
          act("Morning", "10:00", "Swim and breakfast at Vagator Beach", "Activity", "Vagator Beach, Vagator, Goa", 150, 400,
            "Big Vagator has rocks at the edges; swim in the sandy middle stretch and watch for red flags."),
          act("Afternoon", "14:00", "Anjuna Beach and cliffs", "Sightseeing", "Anjuna Beach, Anjuna, Goa", 120, 300,
            "The Wednesday flea market runs here roughly November to April; otherwise it is a relaxed beach afternoon."),
          act("Evening", "19:30", "Arpora Saturday Night Market", "Shopping", "Saturday Night Market, Arpora, Goa", 150, 500,
            "Runs only on Saturday evenings in season (roughly November to April); on other nights head to Baga's Tito's Lane instead."),
        ],
      },
      {
        day: 3,
        title: "Old Goa churches and Panjim",
        activities: [
          act("Morning", "09:00", "Basilica of Bom Jesus", "Sightseeing", "Basilica of Bom Jesus, Old Goa, Goa", 45, 0,
            "UNESCO-listed church holding St Francis Xavier's relics; cover shoulders and knees, and expect Sunday morning mass."),
          act("Morning", "10:00", "Se Cathedral and Church of St Francis of Assisi", "Sightseeing", "Se Cathedral, Old Goa, Goa", 60, 0,
            "Right across the road from Bom Jesus; the ASI museum next door is closed on Fridays."),
          act("Afternoon", "12:30", "Fish thali at Ritz Classic", "Food", "Ritz Classic, Panaji, Goa", 75, 500,
            "Popular local lunch spot in Panjim known for fish thali; go before 1 pm to avoid a queue."),
          act("Afternoon", "15:30", "Fontainhas Latin Quarter walk", "Sightseeing", "Fontainhas, Panaji, Goa", 90, 0,
            "Colourful Portuguese-era lanes; residents live here, so keep photos respectful and do not block doorways."),
          act("Evening", "18:00", "Mandovi River sunset cruise", "Activity", "Santa Monica Jetty, Panaji, Goa", 60, 500,
            "Tickets sold at the jetty on the day; the GTDC boats include a short Goan folk dance show."),
        ],
      },
      {
        day: 4,
        title: "Dona Paula and departure",
        activities: [
          act("Morning", "08:30", "Dona Paula viewpoint", "Sightseeing", "Dona Paula Jetty, Dona Paula, Goa", 45, 0,
            "Views over the Zuari and Mandovi mouths; best before the tour buses arrive around 10 am."),
          act("Morning", "10:00", "Breakfast at Cafe Bhonsle", "Food", "Cafe Bhonsle, Panaji, Goa", 45, 200,
            "Old-school Panjim cafe for ros omelette and bhaji-pav; cash is handy."),
          act("Morning", "11:00", "Panjim Municipal Market for cashews and spices", "Shopping", "Panaji Municipal Market, Panaji, Goa", 60, 800,
            "Buy cashews, kokum and Goan sausages here rather than at airport shops; ask for vacuum packing for sausages."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Jaipur
  {
    slug: "jaipur-3-days-forts-and-bazaars",
    title: "Jaipur in 3 days: forts, palaces and bazaars",
    summary:
      "Amber and Nahargarh forts, the City Palace and Jantar Mantar, and the Pink City bazaars, paced so you are indoors in the midday heat.",
    destination: { name: "Jaipur", query: "Jaipur, Rajasthan, India", region: "Rajasthan", country: "India" },
    days: 3,
    nights: 2,
    theme: "heritage",
    budgetBand: "mid",
    estCostPerPerson: 11000,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tags: ["forts", "palaces", "bazaars", "rajasthani food"],
    featured: true,
    itinerary: [
      {
        day: 1,
        title: "Arrive and the old city",
        activities: [
          act("Afternoon", "15:00", "Hawa Mahal", "Sightseeing", "Hawa Mahal, Badi Choupad, Jaipur, Rajasthan", 60, 50,
            "Closes around 5 pm; for the classic facade photo, use a rooftop cafe across the road."),
          act("Afternoon", "16:15", "Johari Bazaar and Bapu Bazaar", "Shopping", "Johari Bazaar, Jaipur, Rajasthan", 120, 500,
            "Johari is for jewellery and block prints, Bapu for mojaris and textiles; bargain firmly and ignore touts."),
          act("Evening", "19:00", "Dinner at Laxmi Mishthan Bhandar", "Food", "Laxmi Mishthan Bhandar, Johari Bazaar, Jaipur, Rajasthan", 75, 500,
            "LMB has been serving vegetarian Rajasthani thalis since the 1950s; save room for the ghewar."),
        ],
      },
      {
        day: 2,
        title: "Amber and Nahargarh",
        activities: [
          act("Morning", "08:30", "Amber Fort", "Sightseeing", "Amber Fort, Amer, Jaipur, Rajasthan", 150, 100,
            "Opens at 8 am; arrive early to beat crowds and heat, and consider the composite ticket if you will visit several monuments."),
          act("Morning", "11:15", "Panna Meena ka Kund stepwell", "Sightseeing", "Panna Meena ka Kund, Amer, Jaipur, Rajasthan", 30, 0,
            "A five-minute drive from the fort; walking on the steps is no longer allowed, so view from the edge."),
          act("Afternoon", "12:00", "Jal Mahal viewpoint", "Sightseeing", "Jal Mahal, Amer Road, Jaipur, Rajasthan", 20, 0,
            "The palace itself is closed to visitors; a quick photo stop on the lakeside promenade on the way back."),
          act("Afternoon", "13:00", "Pyaaz kachori at Rawat Mishthan Bhandar", "Food", "Rawat Mishthan Bhandar, Sindhi Camp, Jaipur, Rajasthan", 45, 200,
            "Famous for onion kachori and mawa kachori; it is a busy standing-room snack counter, so keep it light."),
          act("Afternoon", "16:00", "Nahargarh Fort sunset", "Sightseeing", "Nahargarh Fort, Jaipur, Rajasthan", 120, 50,
            "Views over the whole city; the road up is steep, so book a cab both ways and leave before dark."),
        ],
      },
      {
        day: 3,
        title: "City Palace, Jantar Mantar and departure",
        activities: [
          act("Morning", "09:30", "City Palace", "Sightseeing", "City Palace, Jaipur, Rajasthan", 120, 300,
            "Opens 9:30 am; the basic ticket covers the courtyards and museum galleries, the private Chandra Mahal tour costs extra."),
          act("Morning", "11:45", "Jantar Mantar", "Sightseeing", "Jantar Mantar, Jaipur, Rajasthan", 60, 50,
            "Next to City Palace; hire the audio guide or a licensed guide, as the instruments make little sense without explanation."),
          act("Afternoon", "13:00", "Lunch at Natraj, MI Road", "Food", "Natraj Restaurant, MI Road, Jaipur, Rajasthan", 60, 500,
            "Long-running vegetarian restaurant on MI Road; the Rajasthani thali and kulfi are dependable."),
          act("Afternoon", "14:30", "Albert Hall Museum", "Sightseeing", "Albert Hall Museum, Ram Niwas Garden, Jaipur, Rajasthan", 75, 40,
            "Indo-Saracenic building with an Egyptian mummy and arms gallery; a good indoor stop before heading to the airport."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Udaipur
  {
    slug: "udaipur-3-days-lakes-and-palaces",
    title: "Udaipur in 3 days: lakes, palaces and rooftop sunsets",
    summary:
      "The City Palace and a Lake Pichola boat ride, folk dance at Bagore ki Haveli, and quiet mornings around Fateh Sagar, with lake-view stays.",
    destination: { name: "Udaipur", query: "Udaipur, Rajasthan, India", region: "Rajasthan", country: "India" },
    days: 3,
    nights: 2,
    theme: "heritage",
    budgetBand: "premium",
    estCostPerPerson: 22000,
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    tags: ["lakes", "palaces", "romantic", "folk dance"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Old city ghats",
        activities: [
          act("Afternoon", "16:00", "Jagdish Temple", "Sightseeing", "Jagdish Temple, Udaipur, Rajasthan", 30, 0,
            "Busy 17th-century temple a short climb from the ghats; remove footwear at the entrance."),
          act("Evening", "17:00", "Sunset at Gangaur Ghat", "Sightseeing", "Gangaur Ghat, Udaipur, Rajasthan", 60, 0,
            "Watch the City Palace light up across the water; the ghat gets crowded just before the show."),
          act("Evening", "19:00", "Dharohar folk dance show at Bagore ki Haveli", "Activity", "Bagore Ki Haveli, Gangaur Ghat, Udaipur, Rajasthan", 60, 200,
            "The show starts around 7 pm; buy tickets from 6 pm and arrive early for a front-row seat."),
          act("Night", "20:30", "Lakeside dinner at Ambrai", "Food", "Ambrai Restaurant, Hanuman Ghat, Udaipur, Rajasthan", 90, 1800,
            "Across the lake from the City Palace; book a waterside table a day ahead."),
        ],
      },
      {
        day: 2,
        title: "City Palace and Lake Pichola",
        activities: [
          act("Morning", "09:30", "City Palace", "Sightseeing", "City Palace, Udaipur, Rajasthan", 180, 300,
            "Allow three hours; the audio guide is worth it, and the upper courtyards have the best lake views."),
          act("Afternoon", "13:00", "Thali lunch at Natraj Dining Hall", "Food", "Natraj Dining Hall, Udaipur, Rajasthan", 60, 400,
            "Unlimited Rajasthani-Gujarati thali, a local favourite; expect a short wait at peak lunch hour."),
          act("Afternoon", "15:30", "Lake Pichola boat ride", "Activity", "Rameshwar Ghat, City Palace, Udaipur, Rajasthan", 60, 500,
            "Boats leave from the City Palace jetty; the late-afternoon slots have the best light."),
          act("Evening", "17:30", "Karni Mata ropeway sunset", "Activity", "Karni Mata Ropeway, Deendayal Upadhyay Park, Udaipur, Rajasthan", 60, 150,
            "Short cable car up Machhla Magra hill; queues build before sunset, so go early."),
        ],
      },
      {
        day: 3,
        title: "Fateh Sagar and departure",
        activities: [
          act("Morning", "09:00", "Saheliyon ki Bari", "Sightseeing", "Saheliyon Ki Bari, Udaipur, Rajasthan", 45, 10,
            "Small 18th-century garden with fountains; calm first thing in the morning."),
          act("Morning", "10:15", "Fateh Sagar Lake walk and boat", "Activity", "Fateh Sagar Lake, Udaipur, Rajasthan", 90, 200,
            "Walk the lakeside road and take a short boat to Nehru Garden island if the water level allows."),
          act("Afternoon", "12:15", "Hathi Pol Bazaar for miniature paintings", "Shopping", "Hathi Pol Bazaar, Udaipur, Rajasthan", 60, 1000,
            "Good for miniature paintings and leather goods; ask artists to show a certificate if buying expensive work."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Manali
  {
    slug: "manali-5-days-solang-sissu-naggar",
    title: "Manali in 5 days: Solang, Sissu and Naggar",
    summary:
      "Old Manali and Hadimba, a day through the Atal Tunnel to Sissu and Solang, the Naggar castle and Roerich gallery, and the Jogini Falls walk.",
    destination: { name: "Manali", query: "Manali, Himachal Pradesh, India", region: "Himachal Pradesh", country: "India" },
    days: 5,
    nights: 4,
    theme: "mountain",
    budgetBand: "mid",
    estCostPerPerson: 19000,
    bestMonths: [3, 4, 5, 6, 10],
    tags: ["mountains", "adventure", "paragliding", "cafes", "trek"],
    featured: true,
    itinerary: [
      {
        day: 1,
        title: "Arrive and Old Manali",
        activities: [
          act("Afternoon", "15:30", "Hadimba Devi Temple", "Sightseeing", "Hadimba Devi Temple, Manali, Himachal Pradesh", 45, 0,
            "Wooden pagoda temple in a cedar forest; weekend afternoons bring long queues for the inner shrine."),
          act("Evening", "17:00", "Old Manali village and Manu Temple", "Sightseeing", "Manu Temple, Old Manali, Himachal Pradesh", 60, 0,
            "Walk up through Old Manali's lanes; the last stretch is steep and slippery after rain."),
          act("Evening", "19:30", "Dinner at Johnson's Cafe", "Food", "Johnson's Cafe, Circuit House Road, Manali, Himachal Pradesh", 90, 900,
            "Long-running garden restaurant known for local trout; carry a jacket as evenings get cold."),
        ],
      },
      {
        day: 2,
        title: "Atal Tunnel, Sissu and Solang",
        activities: [
          act("Morning", "08:00", "Drive through the Atal Tunnel", "Transport", "Atal Tunnel South Portal, Dhundi, Himachal Pradesh", 60, 1500,
            "Hire a local Himachal taxi for the day; leave early to avoid traffic at the tunnel and check if a permit or congestion fee applies that season."),
          act("Morning", "09:30", "Sissu Waterfall and Chandra valley", "Sightseeing", "Sissu Waterfall, Sissu, Lahaul, Himachal Pradesh", 90, 0,
            "Much colder than Manali even in summer; carry a warm layer and sunglasses."),
          act("Afternoon", "13:00", "Paragliding at Solang Valley", "Activity", "Solang Valley, Manali, Himachal Pradesh", 120, 3000,
            "Flights are weather-dependent and usually stop by mid-afternoon; agree on flight length and price before paying."),
          act("Afternoon", "15:30", "Solang ropeway", "Activity", "Solang Valley Ropeway, Solang, Himachal Pradesh", 60, 700,
            "Skip if clouds are low as there is little to see from the top; tickets at the base station."),
        ],
      },
      {
        day: 3,
        title: "Naggar",
        activities: [
          act("Morning", "10:00", "Naggar Castle", "Sightseeing", "Naggar Castle, Naggar, Himachal Pradesh", 60, 30,
            "Stone-and-timber castle about 45 minutes from Manali along the left bank road; views over the Kullu valley."),
          act("Morning", "11:15", "Nicholas Roerich Art Gallery", "Sightseeing", "Nicholas Roerich Art Gallery, Naggar, Himachal Pradesh", 60, 50,
            "Closed on Mondays; a short uphill walk from the castle."),
          act("Afternoon", "12:45", "Lunch at Naggar Castle restaurant", "Food", "Naggar Castle, Naggar, Himachal Pradesh", 60, 500,
            "The HPTDC-run castle has a simple restaurant with a valley-view terrace."),
          act("Evening", "17:30", "Mall Road evening walk", "Shopping", "Mall Road, Manali, Himachal Pradesh", 90, 500,
            "Traffic-free promenade in the evening; good for momos and woollens."),
        ],
      },
      {
        day: 4,
        title: "Vashisht and Jogini Falls",
        activities: [
          act("Morning", "08:00", "Vashisht hot springs and temple", "Sightseeing", "Vashisht Temple, Vashisht, Himachal Pradesh", 45, 0,
            "Separate public baths for men and women; go early before they get crowded."),
          act("Morning", "09:00", "Jogini Falls walk", "Activity", "Jogini Waterfall, Vashisht, Himachal Pradesh", 180, 0,
            "About 3 km each way from Vashisht through orchards; wear shoes with grip and carry water."),
          act("Afternoon", "13:30", "Tibetan lunch at Chopsticks", "Food", "Chopsticks Restaurant, Mall Road, Manali, Himachal Pradesh", 60, 500,
            "Long-running spot for thukpa and momos on Mall Road."),
          act("Afternoon", "15:00", "Gadhan Thekchhokling Gompa", "Sightseeing", "Gadhan Thekchhokling Gompa, Manali, Himachal Pradesh", 45, 0,
            "Small Tibetan monastery near Mall Road; the lanes around it sell carpets and handicrafts."),
        ],
      },
      {
        day: 5,
        title: "Van Vihar and departure",
        activities: [
          act("Morning", "09:00", "Van Vihar deodar park", "Sightseeing", "Van Vihar, Mall Road, Manali, Himachal Pradesh", 45, 20,
            "Quiet cedar forest walk beside the Beas; small boating pond inside."),
          act("Morning", "10:00", "Kullu shawls at Bhuttico", "Shopping", "Bhuttico Showroom, Mall Road, Manali, Himachal Pradesh", 45, 2000,
            "Weavers' cooperative with fixed prices, a safer bet than roadside stalls for genuine Kullu shawls."),
          act("Morning", "11:00", "Depart from Manali", "Transport", "Manali Bus Stand, Manali, Himachal Pradesh", 30, 0,
            "Volvo buses to Delhi leave in the evening; for Bhuntar airport allow 1.5 hours by road."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Coorg
  {
    slug: "coorg-3-days-monsoon-waterfalls",
    title: "Coorg in 3 days: monsoon waterfalls and coffee hills",
    summary:
      "Misty Madikeri viewpoints, Abbey Falls in full flow, a jeep ride up Mandalpatti and a Tibetan monastery on the way out.",
    destination: { name: "Coorg", query: "Madikeri, Kodagu, Karnataka, India", region: "Karnataka", country: "India" },
    days: 3,
    nights: 2,
    theme: "monsoon",
    budgetBand: "mid",
    estCostPerPerson: 11000,
    bestMonths: [7, 8, 9, 10],
    tags: ["waterfalls", "coffee", "monsoon", "viewpoints"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Arrive in Madikeri",
        activities: [
          act("Afternoon", "15:30", "Madikeri Fort", "Sightseeing", "Madikeri Fort, Madikeri, Karnataka", 45, 0,
            "Small fort in the town centre with a church-turned-museum; quick stop rather than a half-day."),
          act("Evening", "17:00", "Raja's Seat sunset", "Sightseeing", "Raja's Seat, Madikeri, Karnataka", 60, 20,
            "Garden viewpoint over the valleys; in monsoon the view may be fully clouded, which is part of the charm."),
          act("Evening", "19:30", "Kodava dinner at Coorg Cuisinette", "Food", "Coorg Cuisinette, Madikeri, Karnataka", 75, 600,
            "Try pandi curry with kadambuttu; call ahead in monsoon as hours can vary."),
        ],
      },
      {
        day: 2,
        title: "Mandalpatti and Abbey Falls",
        activities: [
          act("Morning", "07:00", "Jeep ride to Mandalpatti viewpoint", "Activity", "Mandalpatti Viewpoint, Kodagu, Karnataka", 180, 800,
            "The last stretch needs a 4x4 jeep hired from the base; share one to split the cost. Leeches are common in monsoon, carry salt."),
          act("Morning", "11:00", "Abbey Falls", "Sightseeing", "Abbey Falls, Madikeri, Karnataka", 60, 30,
            "Short walk down through coffee and pepper estates; the viewing bridge can be closed during very heavy rain."),
          act("Afternoon", "13:00", "Lunch in Madikeri town", "Food", "Madikeri Main Road, Madikeri, Karnataka", 60, 400,
            "Several simple Udupi and Kodava restaurants along the main road; buy Coorg coffee and spices while in town."),
          act("Evening", "17:00", "Omkareshwara Temple", "Sightseeing", "Omkareshwara Temple, Madikeri, Karnataka", 30, 0,
            "Unusual 19th-century temple with Islamic-style domes and a water tank."),
        ],
      },
      {
        day: 3,
        title: "Dubare, Nisargadhama and Bylakuppe",
        activities: [
          act("Morning", "08:30", "Dubare Elephant Camp", "Activity", "Dubare Elephant Camp, Kodagu, Karnataka", 120, 100,
            "Morning session is best to see bathing; in heavy monsoon the river crossing may be suspended, so check first."),
          act("Morning", "11:15", "Kaveri Nisargadhama", "Sightseeing", "Kaveri Nisargadhama, Kushalnagar, Karnataka", 60, 30,
            "Bamboo-forest island reached by a hanging bridge; a gentle walk on the way to Kushalnagar."),
          act("Afternoon", "13:00", "Namdroling Monastery (Golden Temple)", "Sightseeing", "Namdroling Monastery, Bylakuppe, Karnataka", 75, 0,
            "Large Tibetan monastery with gilded statues; the canteens outside serve good momos and thukpa for a late lunch."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Rishikesh
  {
    slug: "rishikesh-3-days-rafting-and-ganga-aarti",
    title: "Rishikesh in 3 days: rafting, ashrams and Ganga aarti",
    summary:
      "White-water rafting from Shivpuri, the Beatles Ashram, evening aarti on the ghats and a sunrise drive to Kunjapuri.",
    destination: { name: "Rishikesh", query: "Rishikesh, Uttarakhand, India", region: "Uttarakhand", country: "India" },
    days: 3,
    nights: 2,
    theme: "mountain",
    budgetBand: "budget",
    estCostPerPerson: 8000,
    bestMonths: [2, 3, 4, 5, 9, 10, 11],
    tags: ["rafting", "yoga", "ganga", "adventure", "spiritual"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Arrive and evening aarti",
        activities: [
          act("Afternoon", "15:30", "Ram Jhula and Swarg Ashram walk", "Sightseeing", "Ram Jhula, Rishikesh, Uttarakhand", 60, 0,
            "Walk across the suspension bridge and along the east bank; Laxman Jhula has been closed to foot traffic, so use Ram Jhula."),
          act("Evening", "17:30", "Ganga aarti at Parmarth Niketan", "Sightseeing", "Parmarth Niketan, Swarg Ashram, Rishikesh, Uttarakhand", 75, 0,
            "Free; arrive 30 minutes early to sit on the steps near the river. Time shifts with sunset."),
          act("Evening", "19:15", "Dinner at Chotiwala", "Food", "Chotiwala Restaurant, Swarg Ashram, Rishikesh, Uttarakhand", 60, 350,
            "Decades-old vegetarian restaurant by Ram Jhula; Rishikesh is alcohol-free and largely vegetarian."),
        ],
      },
      {
        day: 2,
        title: "Rafting and Beatles Ashram",
        activities: [
          act("Morning", "09:00", "White-water rafting from Shivpuri", "Activity", "Shivpuri, Rishikesh, Uttarakhand", 180, 800,
            "The 16 km Shivpuri stretch has grade II-III rapids; book a licensed operator and note rafting is closed during monsoon (July to mid-September)."),
          act("Afternoon", "13:00", "Lunch at Little Buddha Cafe", "Food", "Little Buddha Cafe, Tapovan, Rishikesh, Uttarakhand", 60, 450,
            "Treehouse-style cafe overlooking the river; popular with backpackers."),
          act("Afternoon", "15:00", "Beatles Ashram (Chaurasi Kutia)", "Sightseeing", "Beatles Ashram, Rishikesh, Uttarakhand", 90, 150,
            "Graffiti-covered ruins of the Maharishi's ashram inside Rajaji Tiger Reserve; go well before the late-afternoon closing time."),
        ],
      },
      {
        day: 3,
        title: "Kunjapuri sunrise and departure",
        activities: [
          act("Morning", "05:30", "Sunrise at Kunjapuri Devi Temple", "Sightseeing", "Kunjapuri Devi Temple, Tehri Garhwal, Uttarakhand", 120, 0,
            "Leave Rishikesh by 4:45 am by taxi; about 300 steps to the top, with Himalayan peaks visible on clear mornings."),
          act("Morning", "09:30", "Breakfast and Triveni Ghat", "Sightseeing", "Triveni Ghat, Rishikesh, Uttarakhand", 60, 150,
            "The town's main bathing ghat on the west bank; quieter in the morning than at the evening aarti."),
          act("Morning", "11:00", "Depart from Rishikesh", "Transport", "Yog Nagari Rishikesh Railway Station, Rishikesh, Uttarakhand", 30, 0,
            "Dehradun's Jolly Grant airport is about 45 minutes away; Haridwar has more train options."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Kerala
  {
    slug: "kerala-5-days-munnar-and-alleppey",
    title: "Kerala in 5 days: Munnar tea hills and an Alleppey houseboat",
    summary:
      "Two days in Munnar's tea estates and Eravikulam, then down to Alleppey for a night on a houseboat, finishing in Fort Kochi.",
    destination: { name: "Munnar and Alleppey", query: "Munnar, Kerala, India", region: "Kerala", country: "India" },
    days: 5,
    nights: 4,
    theme: "monsoon",
    budgetBand: "mid",
    estCostPerPerson: 24000,
    bestMonths: [6, 7, 8, 9, 10],
    tags: ["tea estates", "backwaters", "houseboat", "monsoon", "wildlife"],
    featured: true,
    itinerary: [
      {
        day: 1,
        title: "Kochi to Munnar",
        activities: [
          act("Afternoon", "13:30", "Cheeyappara Waterfalls stop", "Sightseeing", "Cheeyappara Waterfalls, Idukki, Kerala", 30, 0,
            "Roadside cascade on the Kochi-Munnar highway; at its best in monsoon, but the rocks are slippery."),
          act("Afternoon", "16:00", "KDHP Tea Museum", "Sightseeing", "Tea Museum, Nullatanni, Munnar, Kerala", 60, 125,
            "Short film and a working tea-processing demo; closed on Mondays."),
          act("Evening", "19:30", "Dinner in Munnar town", "Food", "Rapsy Restaurant, Munnar, Kerala", 60, 400,
            "Simple, long-running bazaar restaurant for parottas and Kerala curries."),
        ],
      },
      {
        day: 2,
        title: "Eravikulam and Lakkam",
        activities: [
          act("Morning", "08:00", "Eravikulam National Park (Rajamala)", "Sightseeing", "Eravikulam National Park, Munnar, Kerala", 180, 200,
            "Book tickets online in advance; forest buses take you up to see Nilgiri tahr. The park closes for calving roughly February to March."),
          act("Afternoon", "12:00", "Lunch on the Marayoor road", "Food", "Lakkam Waterfalls, Marayoor Road, Idukki, Kerala", 45, 300,
            "Small eateries near the falls entrance serve simple meals; carry snacks as options are limited."),
          act("Afternoon", "13:00", "Lakkam Waterfalls", "Sightseeing", "Lakkam Waterfalls, Marayoor Road, Idukki, Kerala", 60, 50,
            "Short forest walk to a pool; bathing may be restricted when the water is high in monsoon."),
          act("Afternoon", "16:00", "Tea estate walk near Munnar", "Activity", "Kannan Devan Hills, Munnar, Kerala", 60, 0,
            "Stick to public roads through the estates; ask before walking between the tea rows."),
        ],
      },
      {
        day: 3,
        title: "Mattupetty and drive to Alleppey",
        activities: [
          act("Morning", "08:30", "Mattupetty Dam", "Sightseeing", "Mattupetty Dam, Munnar, Kerala", 45, 20,
            "Early morning mist over the reservoir; skip the speed boats if short on time."),
          act("Morning", "09:30", "Echo Point", "Sightseeing", "Echo Point, Munnar, Kerala", 30, 20,
            "Quick lakeside stop on the same road as Mattupetty."),
          act("Morning", "11:00", "Drive Munnar to Alleppey", "Transport", "Alappuzha, Kerala", 300, 3000,
            "About 5 hours by road; per-person cost assumes a shared private cab. Monsoon landslides can close ghat roads, so check before leaving."),
          act("Evening", "17:30", "Alappuzha Beach and old pier", "Sightseeing", "Alappuzha Beach, Alappuzha, Kerala", 60, 0,
            "Swimming is unsafe in monsoon; enjoy it as an evening walk."),
        ],
      },
      {
        day: 4,
        title: "Houseboat on the backwaters",
        activities: [
          act("Afternoon", "12:00", "Board a houseboat at Punnamada", "Activity", "Punnamada Finishing Point, Alappuzha, Kerala", 60, 5500,
            "Price is per person for a shared two-bedroom boat with meals; book through a DTPC-approved operator and confirm AC hours."),
          act("Afternoon", "13:30", "Kerala lunch on board", "Food", "Punnamada Lake, Alappuzha, Kerala", 60, 0,
            "Included in the houseboat price; ask for karimeen (pearl spot) fry in advance."),
          act("Afternoon", "15:00", "Cruise through Kuttanad paddy canals", "Sightseeing", "Kuttanad, Alappuzha, Kerala", 180, 0,
            "Houseboats must moor by around 5:30 pm; a canoe side-trip into narrow canals costs extra but is worth it."),
        ],
      },
      {
        day: 5,
        title: "Fort Kochi and departure",
        activities: [
          act("Morning", "09:00", "Disembark and drive to Fort Kochi", "Transport", "Fort Kochi, Kochi, Kerala", 120, 1000,
            "About 1.5 to 2 hours by road depending on traffic."),
          act("Morning", "11:30", "Chinese fishing nets and beach walk", "Sightseeing", "Chinese Fishing Nets, Fort Kochi, Kerala", 45, 0,
            "Fishermen may let you help haul a net for a small tip."),
          act("Afternoon", "12:30", "Lunch at Kashi Art Cafe", "Food", "Kashi Art Cafe, Burgher Street, Fort Kochi, Kerala", 60, 600,
            "Gallery-cafe that has been a Fort Kochi fixture for decades."),
          act("Afternoon", "14:30", "Transfer to Cochin airport", "Transport", "Cochin International Airport, Nedumbassery, Kerala", 90, 800,
            "Allow at least 1.5 hours from Fort Kochi."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Varanasi
  {
    slug: "varanasi-2-days-ghats-and-aarti",
    title: "Varanasi in 2 days: ghats, aarti and a sunrise boat",
    summary:
      "Walk the ghats from Assi to Dashashwamedh, watch the evening Ganga aarti, then a dawn boat ride, Kashi Vishwanath and Sarnath.",
    destination: { name: "Varanasi", query: "Varanasi, Uttar Pradesh, India", region: "Uttar Pradesh", country: "India" },
    days: 2,
    nights: 1,
    theme: "heritage",
    budgetBand: "budget",
    estCostPerPerson: 5000,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tags: ["ghats", "spiritual", "street food", "boat ride"],
    featured: true,
    itinerary: [
      {
        day: 1,
        title: "Ghats and evening aarti",
        activities: [
          act("Afternoon", "15:30", "Ghat walk from Assi to Dashashwamedh", "Sightseeing", "Assi Ghat, Varanasi, Uttar Pradesh", 150, 0,
            "About 3 km along the river; wear closed shoes, and do not photograph cremations at Harishchandra Ghat."),
          act("Evening", "18:15", "Ganga aarti at Dashashwamedh Ghat", "Sightseeing", "Dashashwamedh Ghat, Varanasi, Uttar Pradesh", 75, 0,
            "Starts around sunset; arrive 45 minutes early for a step seat, or watch from a boat for about Rs 200."),
          act("Night", "20:00", "Chaat at Kashi Chat Bhandar", "Food", "Kashi Chat Bhandar, Godowlia, Varanasi, Uttar Pradesh", 45, 200,
            "Famous for tamatar chaat; crowded after the aarti but moves quickly."),
        ],
      },
      {
        day: 2,
        title: "Sunrise boat, Vishwanath and Sarnath",
        activities: [
          act("Morning", "05:45", "Sunrise boat ride", "Activity", "Dashashwamedh Ghat, Varanasi, Uttar Pradesh", 90, 400,
            "Agree the price and route before boarding; a rowing boat is quieter than a motorboat."),
          act("Morning", "07:45", "Kashi Vishwanath Temple", "Sightseeing", "Kashi Vishwanath Temple, Varanasi, Uttar Pradesh", 90, 0,
            "Phones, bags and leather items are not allowed inside; use the lockers and expect security queues."),
          act("Morning", "09:45", "Lassi at Blue Lassi Shop", "Food", "Blue Lassi Shop, Kachori Gali, Varanasi, Uttar Pradesh", 30, 150,
            "Tiny shop in the old-city lanes serving lassi in clay cups since the 1920s."),
          act("Morning", "11:00", "Sarnath and Dhamek Stupa", "Sightseeing", "Dhamek Stupa, Sarnath, Varanasi, Uttar Pradesh", 120, 30,
            "Where the Buddha gave his first sermon, about 30 minutes from the ghats; the Sarnath Museum is closed on Fridays."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Hampi
  {
    slug: "hampi-3-days-ruins-and-boulders",
    title: "Hampi in 3 days: Vijayanagara ruins and boulder sunsets",
    summary:
      "The Virupaksha and Vittala temples, the Royal Enclosure and Lotus Mahal, and sunrise from Matanga Hill over a boulder landscape.",
    destination: { name: "Hampi", query: "Hampi, Karnataka, India", region: "Karnataka", country: "India" },
    days: 3,
    nights: 2,
    theme: "heritage",
    budgetBand: "budget",
    estCostPerPerson: 7000,
    bestMonths: [10, 11, 12, 1, 2],
    tags: ["ruins", "unesco", "temples", "sunrise", "cycling"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Arrive and Hampi Bazaar",
        activities: [
          act("Afternoon", "15:30", "Virupaksha Temple", "Sightseeing", "Virupaksha Temple, Hampi, Karnataka", 60, 0,
            "Still-active temple with a temple elephant in the mornings; a small camera fee may apply."),
          act("Evening", "17:15", "Sunset from Hemakuta Hill", "Sightseeing", "Hemakuta Hill, Hampi, Karnataka", 60, 0,
            "An easy climb behind Virupaksha with early temple ruins; far less strenuous than Matanga."),
          act("Evening", "19:30", "Dinner near Hampi Bazaar", "Food", "Hampi Bazaar, Hampi, Karnataka", 60, 300,
            "Simple cafes and thali places cluster around the bazaar; Hampi is largely vegetarian and alcohol-free."),
        ],
      },
      {
        day: 2,
        title: "Vittala Temple to the Royal Centre",
        activities: [
          act("Morning", "08:30", "Vittala Temple and stone chariot", "Sightseeing", "Vittala Temple, Hampi, Karnataka", 120, 40,
            "Battery carts run from the parking area; the same ASI ticket covers the Zenana Enclosure and Elephant Stables."),
          act("Afternoon", "13:00", "Royal Enclosure and Mahanavami Dibba", "Sightseeing", "Mahanavami Dibba, Hampi, Karnataka", 60, 0,
            "Little shade here; carry lunch, water and a hat as there are few food options inside the ruins."),
          act("Afternoon", "14:15", "Lotus Mahal and Elephant Stables", "Sightseeing", "Lotus Mahal, Hampi, Karnataka", 75, 0,
            "Covered by the Vittala ticket; keep it with you."),
          act("Afternoon", "15:45", "Hazara Rama Temple", "Sightseeing", "Hazara Rama Temple, Hampi, Karnataka", 45, 0,
            "Detailed Ramayana friezes on the outer walls; late-afternoon light is best for photos."),
        ],
      },
      {
        day: 3,
        title: "Matanga sunrise and the river",
        activities: [
          act("Morning", "05:45", "Sunrise from Matanga Hill", "Activity", "Matanga Hill, Hampi, Karnataka", 120, 0,
            "Steep 30-40 minute scramble from the bazaar end; use a torch and do not go alone in the dark."),
          act("Morning", "08:30", "Achyutaraya Temple", "Sightseeing", "Achyutaraya Temple, Hampi, Karnataka", 45, 0,
            "Beneath Matanga Hill and often empty early in the day."),
          act("Morning", "10:00", "Coracle ride on the Tungabhadra", "Activity", "Kodandarama Temple, Hampi, Karnataka", 45, 200,
            "Round coracles run near the Kodandarama Temple; rides may be suspended when the river is high."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Pondicherry
  {
    slug: "pondicherry-3-days-french-quarter-and-auroville",
    title: "Pondicherry in 3 days: French Quarter, Auroville and beaches",
    summary:
      "Colonial streets and the seafront Promenade, a day at Auroville and Serenity Beach, and a boat out to Paradise Beach.",
    destination: { name: "Pondicherry", query: "Puducherry, India", region: "Puducherry", country: "India" },
    days: 3,
    nights: 2,
    theme: "coast",
    budgetBand: "mid",
    estCostPerPerson: 10000,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tags: ["french quarter", "beaches", "cafes", "auroville"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "French Quarter",
        activities: [
          act("Afternoon", "16:00", "White Town heritage walk", "Sightseeing", "White Town, Puducherry", 90, 0,
            "Walk Rue Romain Rolland and Rue Suffren for the yellow colonial villas; best in the softer late-afternoon light."),
          act("Evening", "17:45", "Promenade Beach", "Sightseeing", "Promenade Beach, Puducherry", 75, 0,
            "Beach Road goes vehicle-free in the evenings; the rocky seafront is not for swimming."),
          act("Evening", "19:30", "Dinner at Le Cafe", "Food", "Le Cafe, Goubert Avenue, Puducherry", 60, 500,
            "Sea-facing cafe on the Promenade; better for the location and a simple meal than fine dining."),
        ],
      },
      {
        day: 2,
        title: "Auroville and Serenity Beach",
        activities: [
          act("Morning", "09:30", "Auroville Visitors Centre and Matrimandir viewpoint", "Sightseeing", "Auroville Visitors Centre, Auroville, Tamil Nadu", 150, 0,
            "Collect a free pass for the Matrimandir viewing point; entry inside the chamber must be booked at least two days ahead."),
          act("Afternoon", "12:30", "Lunch at the Auroville Bakery", "Food", "Auroville Bakery, Kuilapalayam, Auroville, Tamil Nadu", 45, 300,
            "Bread, quiches and cakes; good for a light lunch or picnic supplies."),
          act("Afternoon", "15:30", "Serenity Beach", "Sightseeing", "Serenity Beach, Kottakuppam, Tamil Nadu", 120, 0,
            "Popular with surfers; strong currents, so swim only where locals do and never alone."),
        ],
      },
      {
        day: 3,
        title: "Aurobindo Ashram and Paradise Beach",
        activities: [
          act("Morning", "08:00", "Sri Aurobindo Ashram", "Sightseeing", "Sri Aurobindo Ashram, Puducherry", 45, 0,
            "Silence is expected in the courtyard; photography is not allowed and hours pause at midday."),
          act("Morning", "09:00", "Breakfast at Baker Street", "Food", "Baker Street, Bussy Street, Puducherry", 45, 350,
            "French-style bakery for croissants and coffee."),
          act("Morning", "10:15", "Boat to Paradise Beach", "Activity", "Chunnambar Boat House, Puducherry", 180, 400,
            "Boats run from the Chunnambar boat house during the day; last boats return in the late afternoon."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Darjeeling
  {
    slug: "darjeeling-4-days-tea-and-toy-train",
    title: "Darjeeling in 4 days: Tiger Hill, tea gardens and the toy train",
    summary:
      "A Kanchenjunga sunrise from Tiger Hill, the Himalayan Mountaineering Institute, a tea estate visit and a heritage toy train ride.",
    destination: { name: "Darjeeling", query: "Darjeeling, West Bengal, India", region: "West Bengal", country: "India" },
    days: 4,
    nights: 3,
    theme: "mountain",
    budgetBand: "mid",
    estCostPerPerson: 15000,
    bestMonths: [3, 4, 5, 10, 11],
    tags: ["tea", "toy train", "sunrise", "himalayas"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Arrive and the Mall",
        activities: [
          act("Afternoon", "15:30", "Chowrasta and the Mall", "Sightseeing", "Chowrasta, Darjeeling, West Bengal", 60, 0,
            "The traffic-free square at the top of town; a good first walk to adjust to the altitude."),
          act("Afternoon", "16:30", "Mahakal Temple on Observatory Hill", "Sightseeing", "Mahakal Temple, Observatory Hill, Darjeeling, West Bengal", 45, 0,
            "Short uphill walk from Chowrasta; Hindu and Buddhist shrines share the hilltop. Watch for monkeys."),
          act("Evening", "18:30", "Dinner at Glenary's", "Food", "Glenary's, Nehru Road, Darjeeling, West Bengal", 75, 700,
            "Colonial-era bakery and restaurant; the bakery downstairs is good for next morning's packed breakfast."),
        ],
      },
      {
        day: 2,
        title: "Tiger Hill and Ghoom",
        activities: [
          act("Morning", "04:15", "Sunrise at Tiger Hill", "Sightseeing", "Tiger Hill, Darjeeling, West Bengal", 120, 400,
            "Book a shared jeep the evening before; it is very cold at dawn and Kanchenjunga is often clouded outside October-November."),
          act("Morning", "06:45", "Ghoom Monastery", "Sightseeing", "Ghoom Monastery, Ghum, West Bengal", 30, 0,
            "Yiga Choeling Gompa, one of the oldest in the area, on the way down from Tiger Hill."),
          act("Morning", "07:30", "Batasia Loop and War Memorial", "Sightseeing", "Batasia Loop, Darjeeling, West Bengal", 30, 20,
            "The toy train spirals here; on clear mornings there is a good Kanchenjunga view."),
          act("Morning", "10:30", "Japanese Peace Pagoda", "Sightseeing", "Japanese Peace Pagoda, Jalapahar, Darjeeling, West Bengal", 45, 0,
            "Quiet stupa on the south side of town; the drumming prayers are usually held in the morning and early evening."),
          act("Afternoon", "13:00", "Tibetan lunch at Kunga", "Food", "Kunga Restaurant, Gandhi Road, Darjeeling, West Bengal", 60, 400,
            "Small family-run place for thukpa and momos; it fills up quickly at lunch."),
        ],
      },
      {
        day: 3,
        title: "HMI, ropeway and tea",
        activities: [
          act("Morning", "09:30", "Himalayan Mountaineering Institute and zoo", "Sightseeing", "Himalayan Mountaineering Institute, Darjeeling, West Bengal", 150, 100,
            "One ticket covers the Padmaja Naidu Zoo and the Everest museum; closed on Thursdays."),
          act("Afternoon", "12:30", "Rangeet Valley passenger ropeway", "Activity", "Darjeeling Ropeway, Singamari, Darjeeling, West Bengal", 60, 250,
            "Runs only in good weather and queues can be long; check it is operating before you walk down."),
          act("Afternoon", "14:00", "Happy Valley Tea Estate", "Sightseeing", "Happy Valley Tea Estate, Darjeeling, West Bengal", 75, 100,
            "Factory tours depend on the plucking season and day of week; call ahead to confirm."),
          act("Afternoon", "16:00", "Hot chocolate at Keventer's", "Food", "Keventers, Nehru Road, Darjeeling, West Bengal", 45, 300,
            "Century-old snack bar; the rooftop has views over the town."),
        ],
      },
      {
        day: 4,
        title: "Tea shopping, toy train and departure",
        activities: [
          act("Morning", "09:00", "Tea shopping at Nathmull's", "Shopping", "Nathmull's Tea Room, Laden La Road, Darjeeling, West Bengal", 45, 1000,
            "Long-established tea merchant; ask for a tasting before buying first or second flush."),
          act("Morning", "10:30", "Darjeeling Himalayan Railway joy ride", "Activity", "Darjeeling Railway Station, Darjeeling, West Bengal", 120, 1600,
            "Book the steam or diesel joy ride on IRCTC well ahead; it runs to Ghum and back with a stop at Batasia."),
          act("Afternoon", "13:00", "Depart for NJP or Bagdogra", "Transport", "Darjeeling Motor Stand, Darjeeling, West Bengal", 30, 400,
            "Shared jeeps and taxis take about 3 to 3.5 hours; leave by early afternoon to avoid driving the hills after dark."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Leh-Ladakh
  {
    slug: "leh-ladakh-6-days-pangong-and-nubra",
    title: "Leh-Ladakh in 6 days: Pangong, Nubra and Khardung La",
    summary:
      "An easy acclimatisation day in Leh, then a loop over Chang La to Pangong, along the Shyok to Nubra's dunes and back over Khardung La.",
    destination: { name: "Leh-Ladakh", query: "Leh, Ladakh, India", region: "Ladakh", country: "India" },
    days: 6,
    nights: 5,
    theme: "mountain",
    budgetBand: "mid",
    estCostPerPerson: 32000,
    bestMonths: [6, 7, 8, 9],
    tags: ["high altitude", "road trip", "monasteries", "lakes"],
    featured: true,
    itinerary: [
      {
        day: 1,
        title: "Arrive and acclimatise",
        activities: [
          act("Evening", "17:00", "Leh Main Bazaar stroll", "Shopping", "Leh Main Bazaar, Leh, Ladakh", 60, 300,
            "Rest for most of the day after flying in (Leh is at 3,500 m); drink water and avoid alcohol for the first 48 hours."),
          act("Evening", "18:45", "Sunset at Shanti Stupa", "Sightseeing", "Shanti Stupa, Changspa, Leh, Ladakh", 60, 0,
            "Take a taxi to the top instead of climbing the steps on day one."),
          act("Night", "20:00", "Dinner at Tibetan Kitchen", "Food", "Tibetan Kitchen, Fort Road, Leh, Ladakh", 75, 600,
            "Well-known Tibetan restaurant; try the gyathuk and steamed momos."),
        ],
      },
      {
        day: 2,
        title: "Easy day around Leh",
        activities: [
          act("Morning", "10:00", "Leh Palace", "Sightseeing", "Leh Palace, Leh, Ladakh", 60, 30,
            "Nine-storey 17th-century palace overlooking the town; take the climb slowly. Apply for the Inner Line Permit online today if not done."),
          act("Morning", "11:15", "Namgyal Tsemo Gompa", "Sightseeing", "Namgyal Tsemo Gompa, Leh, Ladakh", 45, 30,
            "Reachable by road; the prayer-flag ridge has the best view over Leh."),
          act("Afternoon", "13:00", "Lunch at Gesmo", "Food", "Gesmo Restaurant, Fort Road, Leh, Ladakh", 60, 500,
            "Long-running Fort Road cafe known for its bakery and Ladakhi dishes."),
          act("Afternoon", "15:30", "Shey Palace", "Sightseeing", "Shey Palace, Shey, Ladakh", 60, 30,
            "Old summer capital with a large seated Buddha, about 15 km from Leh on the Manali road."),
        ],
      },
      {
        day: 3,
        title: "Thiksey and over Chang La to Pangong",
        activities: [
          act("Morning", "07:00", "Thiksey Monastery", "Sightseeing", "Thiksey Monastery, Thiksey, Ladakh", 60, 50,
            "Morning prayers start around 6 am; the Maitreya hall and the rooftop view are the highlights."),
          act("Morning", "10:30", "Chang La pass", "Sightseeing", "Chang La, Ladakh", 20, 0,
            "Above 5,300 m; limit the stop to 15-20 minutes and move on if anyone feels a headache or breathlessness."),
          act("Afternoon", "14:00", "Pangong Tso at Spangmik", "Sightseeing", "Pangong Tso, Spangmik, Ladakh", 120, 0,
            "Most lakeside camps are at Spangmik and Lukung; nights are well below freezing even in summer."),
          act("Evening", "18:30", "Pangong sunset", "Sightseeing", "Lukung, Pangong Tso, Ladakh", 60, 0,
            "The lake changes colour through the evening; carry a down jacket and a headlamp."),
        ],
      },
      {
        day: 4,
        title: "Along the Shyok to Nubra",
        activities: [
          act("Morning", "08:00", "Drive Pangong to Nubra via the Shyok road", "Transport", "Shyok, Ladakh", 360, 0,
            "About 6-7 hours; the road can be closed by water crossings or landslides, so confirm with your driver the night before."),
          act("Afternoon", "15:00", "Diskit Monastery and Maitreya statue", "Sightseeing", "Diskit Monastery, Diskit, Nubra, Ladakh", 60, 50,
            "The 32 m Maitreya Buddha faces the Shyok river; the old monastery is a short climb above it."),
          act("Evening", "17:00", "Hunder sand dunes and Bactrian camels", "Activity", "Hunder Sand Dunes, Hunder, Nubra, Ladakh", 90, 500,
            "Double-humped camel rides are short loops; go near sunset when the dunes are cooler and the light is soft."),
        ],
      },
      {
        day: 5,
        title: "Over Khardung La to Leh",
        activities: [
          act("Morning", "09:00", "Drive Nubra to Leh", "Transport", "Diskit, Nubra, Ladakh", 300, 0,
            "About 5 hours including the pass; per-person taxi cost for the whole loop is included in the trip estimate."),
          act("Afternoon", "12:00", "Khardung La pass", "Sightseeing", "Khardung La, Ladakh", 20, 0,
            "Very high altitude; keep the photo stop short and carry water and snacks."),
          act("Evening", "17:00", "Souvenir shopping in Leh", "Shopping", "Tibetan Refugee Market, Leh, Ladakh", 90, 1000,
            "Good for pashmina, prayer flags and apricot products; compare prices across a few stalls."),
        ],
      },
      {
        day: 6,
        title: "Hall of Fame and departure",
        activities: [
          act("Morning", "09:00", "Hall of Fame war museum", "Sightseeing", "Hall of Fame, Leh, Ladakh", 60, 100,
            "Army-run museum near the airport; check your flight time, as most Leh flights depart in the morning."),
          act("Morning", "10:15", "Spituk Monastery", "Sightseeing", "Spituk Monastery, Spituk, Ladakh", 45, 30,
            "Hilltop monastery right beside the runway, five minutes from the terminal."),
          act("Morning", "11:30", "Depart from Leh airport", "Transport", "Kushok Bakula Rimpochee Airport, Leh, Ladakh", 30, 0,
            "Security is strict and queues are long; arrive at least two hours before departure."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Jaisalmer
  {
    slug: "jaisalmer-3-days-golden-fort-and-dunes",
    title: "Jaisalmer in 3 days: the Golden Fort and a night in the dunes",
    summary:
      "Havelis and the living fort of Jaisalmer, the abandoned village of Kuldhara, and a sunset camel ride with a night at a Sam dunes camp.",
    destination: { name: "Jaisalmer", query: "Jaisalmer, Rajasthan, India", region: "Rajasthan", country: "India" },
    days: 3,
    nights: 2,
    theme: "desert",
    budgetBand: "mid",
    estCostPerPerson: 12000,
    bestMonths: [10, 11, 12, 1, 2],
    tags: ["desert", "forts", "camel safari", "havelis", "stargazing"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Havelis and sunset",
        activities: [
          act("Afternoon", "15:00", "Patwon ki Haveli", "Sightseeing", "Patwon Ki Haveli, Jaisalmer, Rajasthan", 60, 100,
            "A cluster of five carved havelis; the main one has a small museum with a separate ticket."),
          act("Evening", "17:15", "Sunset at Vyas Chhatri", "Sightseeing", "Vyas Chhatri, Jaisalmer, Rajasthan", 45, 50,
            "Sandstone cenotaphs with a clear view of the fort glowing at sunset."),
          act("Night", "20:00", "Rooftop dinner at The Trio", "Food", "The Trio, Gandhi Chowk, Jaisalmer, Rajasthan", 75, 700,
            "Long-running rooftop restaurant facing the fort; try ker sangri and laal maas."),
        ],
      },
      {
        day: 2,
        title: "The fort, Kuldhara and Sam dunes",
        activities: [
          act("Morning", "09:00", "Jaisalmer Fort and Fort Palace Museum", "Sightseeing", "Jaisalmer Fort, Jaisalmer, Rajasthan", 120, 150,
            "A living fort with homes and shops inside; take the audio guide at the palace museum."),
          act("Morning", "11:00", "Jain temples inside the fort", "Sightseeing", "Jain Temples, Jaisalmer Fort, Jaisalmer, Rajasthan", 60, 50,
            "Open to non-Jain visitors only until about noon; leather items are not allowed inside."),
          act("Afternoon", "15:00", "Kuldhara abandoned village", "Sightseeing", "Kuldhara, Jaisalmer, Rajasthan", 45, 50,
            "Ruined Paliwal Brahmin village on the way to Sam; little shade, and it closes at sunset."),
          act("Evening", "17:00", "Sunset camel ride at Sam Sand Dunes", "Activity", "Sam Sand Dunes, Jaisalmer, Rajasthan", 90, 600,
            "Agree on duration before mounting; camps usually bundle the ride with dinner and a folk music evening."),
          act("Night", "20:00", "Desert camp dinner and stargazing", "Food", "Sam Sand Dunes, Jaisalmer, Rajasthan", 120, 0,
            "Usually included in the camp package; walk away from the camp lights for a clear view of the stars."),
        ],
      },
      {
        day: 3,
        title: "Dune sunrise and Gadisar Lake",
        activities: [
          act("Morning", "06:45", "Sunrise over the dunes", "Sightseeing", "Sam Sand Dunes, Jaisalmer, Rajasthan", 45, 0,
            "Mornings in winter are close to freezing; keep the camp blanket on until the sun is up."),
          act("Morning", "10:00", "Gadisar Lake", "Sightseeing", "Gadisar Lake, Jaisalmer, Rajasthan", 60, 100,
            "Carved ghats and chhatris around a 14th-century reservoir; paddle boats are optional."),
          act("Morning", "11:30", "Shopping at Sadar Bazaar", "Shopping", "Sadar Bazaar, Jaisalmer, Rajasthan", 60, 800,
            "Mirror-work textiles and camel-leather goods; bargain, and check stitching before buying."),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Ranthambore
  {
    slug: "ranthambore-2-days-tiger-safari",
    title: "Ranthambore in 2 days: tiger safaris and a jungle fort",
    summary:
      "Two jeep or canter safaris into Ranthambore Tiger Reserve with a visit to the 10th-century fort that sits inside it.",
    destination: { name: "Ranthambore", query: "Sawai Madhopur, Rajasthan, India", region: "Rajasthan", country: "India" },
    days: 2,
    nights: 1,
    theme: "wild",
    budgetBand: "premium",
    estCostPerPerson: 16000,
    bestMonths: [11, 12, 1, 2, 3, 4],
    tags: ["tigers", "safari", "wildlife", "fort"],
    featured: false,
    itinerary: [
      {
        day: 1,
        title: "Fort and afternoon safari",
        activities: [
          act("Morning", "10:00", "Ranthambore Fort", "Sightseeing", "Ranthambore Fort, Sawai Madhopur, Rajasthan", 120, 0,
            "UNESCO-listed hill fort inside the reserve; wear good shoes for the long climb and beware of langurs snatching food."),
          act("Afternoon", "12:15", "Trinetra Ganesh Temple", "Sightseeing", "Trinetra Ganesh Temple, Ranthambore Fort, Sawai Madhopur, Rajasthan", 30, 0,
            "Inside the fort; Wednesdays are especially crowded with pilgrims."),
          act("Afternoon", "14:30", "Afternoon safari", "Activity", "Ranthambore National Park, Sawai Madhopur, Rajasthan", 210, 1800,
            "Book on the official Rajasthan forest department portal weeks ahead; the core zones are closed from July to September."),
        ],
      },
      {
        day: 2,
        title: "Morning safari and departure",
        activities: [
          act("Morning", "06:30", "Morning safari", "Activity", "Ranthambore National Park, Sawai Madhopur, Rajasthan", 210, 1800,
            "Winter mornings in an open jeep are very cold; bring a warm jacket, cap and gloves."),
          act("Morning", "11:00", "Dastkar craft centre", "Shopping", "Dastkar Ranthambhore, Sawai Madhopur, Rajasthan", 60, 1000,
            "Women's craft cooperative selling block prints and embroidery, a few minutes from the park road."),
          act("Afternoon", "12:30", "Depart from Sawai Madhopur station", "Transport", "Sawai Madhopur Junction, Sawai Madhopur, Rajasthan", 30, 0,
            "The station walls are painted with wildlife murals; trains to Jaipur take about 2 hours."),
        ],
      },
    ],
  },
];

