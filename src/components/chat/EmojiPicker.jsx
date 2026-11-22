import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Search, Clock, Smile, Flag, Utensils, PawPrint, Car, Hash, Gamepad2, Image as ImageIcon, Sticker } from 'lucide-react';
import { api } from '../../utils/api';
import { useCustomEmojis } from '../../utils/customEmojis';
import { useServerConfig } from '../../utils/permissions';

import { EMOJI_MAP, getTwemojiUrl } from '../../utils/emojiMap';
import { t } from '../../i18n';
export { EMOJI_MAP, getTwemojiUrl };

const CATEGORIES = [
  { id: 'recent', name: t('emoji.frequent'), icon: Clock, keys: [] },
  { id: 'custom', name: t('emoji.custom'), icon: null, keys: [] },
  { id: 'smileys', name: t('emoji.catPeople'), icon: Smile, keys: ["grinning_face","grinning_face_with_big_eyes","grinning_face_with_smiling_eyes","beaming_face_with_smiling_eyes","grinning_squinting_face","grinning_face_with_sweat","rolling_on_the_floor_laughing","face_with_tears_of_joy","slightly_smiling_face","upside_down_face","melting_face","winking_face","smiling_face_with_smiling_eyes","smiling_face_with_halo","smiling_face_with_hearts","smiling_face_with_heart_eyes","star_struck","face_blowing_a_kiss","kissing_face","smiling_face","kissing_face_with_closed_eyes","kissing_face_with_smiling_eyes","smiling_face_with_tear","face_savoring_food","face_with_tongue","winking_face_with_tongue","zany_face","squinting_face_with_tongue","money_mouth_face","smiling_face_with_open_hands","face_with_hand_over_mouth","face_with_open_eyes_and_hand_over_mouth","face_with_peeking_eye","shushing_face","thinking_face","saluting_face","zipper_mouth_face","face_with_raised_eyebrow","neutral_face","expressionless_face","face_without_mouth","dotted_line_face","smirking_face","unamused_face","face_with_rolling_eyes","grimacing_face","lying_face","relieved_face","pensive_face","sleepy_face","drooling_face","sleeping_face","face_with_medical_mask","face_with_thermometer","face_with_head_bandage","nauseated_face","face_vomiting","sneezing_face","hot_face","cold_face","woozy_face","face_with_crossed_out_eyes","exploding_head","cowboy_hat_face","partying_face","disguised_face","smiling_face_with_sunglasses","nerd_face","face_with_monocle","confused_face","face_with_diagonal_mouth","worried_face","slightly_frowning_face","frowning_face","face_with_open_mouth","hushed_face","astonished_face","flushed_face","pleading_face","face_holding_back_tears","frowning_face_with_open_mouth","anguished_face","fearful_face","anxious_face_with_sweat","sad_but_relieved_face","crying_face","loudly_crying_face","face_screaming_in_fear","confounded_face","persevering_face","disappointed_face","downcast_face_with_sweat","weary_face","tired_face","yawning_face","face_with_steam_from_nose","pouting_face","angry_face","face_with_symbols_on_mouth","smiling_face_with_horns","angry_face_with_horns","skull","skull_and_crossbones","pile_of_poo","clown_face","ogre","goblin","ghost","alien","alien_monster","robot","grinning_cat","grinning_cat_with_smiling_eyes","cat_with_tears_of_joy","smiling_cat_with_heart_eyes","cat_with_wry_smile","kissing_cat","weary_cat","crying_cat","pouting_cat","see_no_evil_monkey","hear_no_evil_monkey","speak_no_evil_monkey","kiss_mark","love_letter","heart_with_arrow","heart_with_ribbon","sparkling_heart","growing_heart","beating_heart","revolving_hearts","two_hearts","heart_decoration","heart_exclamation","broken_heart","red_heart","orange_heart","yellow_heart","green_heart","blue_heart","purple_heart","brown_heart","black_heart","white_heart","hundred_points","anger_symbol","collision","dizzy","sweat_droplets","dashing_away","hole","bomb","speech_balloon","left_speech_bubble","right_anger_bubble","thought_balloon","zzz","waving_hand","raised_back_of_hand","hand_with_fingers_splayed","raised_hand","vulcan_salute","rightwards_hand","leftwards_hand","palm_down_hand","palm_up_hand","ok_hand","pinched_fingers","pinching_hand","victory_hand","crossed_fingers","hand_with_index_finger_and_thumb_crossed","love_you_gesture","sign_of_the_horns","call_me_hand","backhand_index_pointing_left","backhand_index_pointing_right","backhand_index_pointing_up","middle_finger","backhand_index_pointing_down","index_pointing_up","index_pointing_at_the_viewer","thumbs_up","thumbs_down","raised_fist","oncoming_fist","left_facing_fist","right_facing_fist","clapping_hands","raising_hands","heart_hands","open_hands","palms_up_together","handshake","folded_hands","writing_hand","nail_polish","selfie","flexed_biceps","mechanical_arm","mechanical_leg","leg","foot","ear","ear_with_hearing_aid","nose","brain","anatomical_heart","lungs","tooth","bone","eyes","eye","tongue","mouth","biting_lip","baby","child","boy","girl","person","person_blond_hair","man","person_beard","woman","older_person","old_man","old_woman","person_frowning","person_pouting","person_gesturing_no","person_gesturing_ok","person_tipping_hand","person_raising_hand","deaf_person","person_bowing","person_facepalming","person_shrugging","police_officer","detective","guard","ninja","construction_worker","person_with_crown","prince","princess","person_wearing_turban","person_with_skullcap","woman_with_headscarf","person_in_tuxedo","person_with_veil","pregnant_woman","pregnant_man","pregnant_person","breast_feeding","baby_angel","santa_claus","mrs_claus","superhero","supervillain","mage","fairy","vampire","merperson","elf","genie","zombie","troll","person_getting_massage","person_getting_haircut","person_walking","person_standing","person_kneeling","person_running","woman_dancing","man_dancing","person_in_suit_levitating","people_with_bunny_ears","person_in_steamy_room","person_climbing","person_fencing","horse_racing","skier","snowboarder","person_golfing","person_surfing","person_rowing_boat","person_swimming","person_bouncing_ball","person_lifting_weights","person_biking","person_mountain_biking","person_cartwheeling","people_wrestling","person_playing_water_polo","person_playing_handball","person_juggling","person_in_lotus_position","person_taking_bath","person_in_bed","women_holding_hands","woman_and_man_holding_hands","men_holding_hands","kiss","couple_with_heart","family","speaking_head","bust_in_silhouette","busts_in_silhouette","people_hugging","footprints"] },
  { id: 'nature', name: t('emoji.catNature'), icon: PawPrint, keys: ["monkey_face","monkey","gorilla","orangutan","dog_face","dog","guide_dog","poodle","wolf","fox","raccoon","cat_face","cat","lion","tiger_face","tiger","leopard","horse_face","horse","unicorn","zebra","deer","bison","cow_face","ox","water_buffalo","cow","pig_face","pig","boar","pig_nose","ram","ewe","goat","camel","two_hump_camel","llama","giraffe","elephant","mammoth","rhinoceros","hippopotamus","mouse_face","mouse","rat","hamster","rabbit_face","rabbit","chipmunk","beaver","hedgehog","bat","bear","koala","panda","sloth","otter","skunk","kangaroo","badger","paw_prints","turkey","chicken","rooster","hatching_chick","baby_chick","front_facing_baby_chick","bird","penguin","dove","eagle","duck","swan","owl","dodo","feather","flamingo","peacock","parrot","frog","crocodile","turtle","lizard","snake","dragon_face","dragon","sauropod","t_rex","spouting_whale","whale","dolphin","seal","fish","tropical_fish","blowfish","shark","octopus","spiral_shell","coral","snail","butterfly","bug","ant","honeybee","beetle","lady_beetle","cricket","cockroach","spider","spider_web","scorpion","mosquito","fly","worm","microbe","bouquet","cherry_blossom","white_flower","lotus","rosette","rose","wilted_flower","hibiscus","sunflower","blossom","tulip","seedling","potted_plant","evergreen_tree","deciduous_tree","palm_tree","cactus","sheaf_of_rice","herb","shamrock","four_leaf_clover","maple_leaf","fallen_leaf","leaf_fluttering_in_wind","empty_nest","nest_with_eggs"] },
  { id: 'food', name: t('emoji.catFood'), icon: Utensils, keys: ["grapes","melon","watermelon","tangerine","lemon","banana","pineapple","mango","red_apple","green_apple","pear","peach","cherries","strawberry","blueberries","kiwi_fruit","tomato","olive","coconut","avocado","eggplant","potato","carrot","ear_of_corn","hot_pepper","bell_pepper","cucumber","leafy_green","broccoli","garlic","onion","mushroom","peanuts","beans","chestnut","bread","croissant","baguette_bread","flatbread","pretzel","bagel","pancakes","waffle","cheese_wedge","meat_on_bone","poultry_leg","cut_of_meat","bacon","hamburger","french_fries","pizza","hot_dog","sandwich","taco","burrito","tamale","stuffed_flatbread","falafel","egg","cooking","shallow_pan_of_food","pot_of_food","fondue","bowl_with_spoon","green_salad","popcorn","butter","salt","canned_food","bento_box","rice_cracker","rice_ball","cooked_rice","curry_rice","steaming_bowl","spaghetti","roasted_sweet_potato","oden","sushi","fried_shrimp","fish_cake_with_swirl","moon_cake","dango","dumpling","fortune_cookie","takeout_box","crab","lobster","shrimp","squid","oyster","soft_ice_cream","shaved_ice","ice_cream","doughnut","cookie","birthday_cake","shortcake","cupcake","pie","chocolate_bar","candy","lollipop","custard","honey_pot","baby_bottle","glass_of_milk","hot_beverage","teapot","teacup_without_handle","sake","bottle_with_popping_cork","wine_glass","cocktail_glass","tropical_drink","beer_mug","clinking_beer_mugs","clinking_glasses","tumbler_glass","pouring_liquid","cup_with_straw","bubble_tea","beverage_box","mate","ice","chopsticks","fork_and_knife_with_plate","fork_and_knife","spoon","kitchen_knife","jar","amphora"] },
  { id: 'activity', name: t('emoji.catActivities'), icon: Gamepad2, keys: ["jack_o_lantern","christmas_tree","fireworks","sparkler","firecracker","sparkles","balloon","party_popper","confetti_ball","tanabata_tree","pine_decoration","japanese_dolls","carp_streamer","wind_chime","moon_viewing_ceremony","red_envelope","ribbon","wrapped_gift","reminder_ribbon","admission_tickets","ticket","military_medal","trophy","sports_medal","1st_place_medal","2nd_place_medal","3rd_place_medal","soccer_ball","baseball","softball","basketball","volleyball","american_football","rugby_football","tennis","flying_disc","bowling","cricket_game","field_hockey","ice_hockey","lacrosse","ping_pong","badminton","boxing_glove","martial_arts_uniform","goal_net","flag_in_hole","ice_skate","fishing_pole","diving_mask","running_shirt","skis","sled","curling_stone","bullseye","yo_yo","kite","pool_8_ball","crystal_ball","magic_wand","nazar_amulet","hamsa","video_game","joystick","slot_machine","game_die","puzzle_piece","teddy_bear","pi_ata","mirror_ball","nesting_dolls","spade_suit","heart_suit","diamond_suit","club_suit","chess_pawn","joker","mahjong_red_dragon","flower_playing_cards","performing_arts","framed_picture","artist_palette","thread","sewing_needle","yarn","knot","glasses","sunglasses","goggles","lab_coat","safety_vest","necktie","t_shirt","jeans","scarf","gloves","coat","socks","dress","kimono","sari","one_piece_swimsuit","briefs","shorts","bikini","woman_s_clothes","purse","handbag","clutch_bag","shopping_bags","backpack","thong_sandal","man_s_shoe","running_shoe","hiking_boot","flat_shoe","high_heeled_shoe","woman_s_sandal","ballet_shoes","woman_s_boot","crown","woman_s_hat","top_hat","graduation_cap","billed_cap","military_helmet","rescue_worker_s_helmet","prayer_beads","lipstick","ring","gem_stone","muted_speaker","speaker_low_volume","speaker_medium_volume","speaker_high_volume","loudspeaker","megaphone","postal_horn","bell","bell_with_slash","musical_score","musical_note","musical_notes","studio_microphone","level_slider","control_knobs","microphone","headphone","radio","saxophone","accordion","guitar","musical_keyboard","trumpet","violin","banjo","drum","long_drum","mobile_phone","mobile_phone_with_arrow","telephone","telephone_receiver","pager","fax_machine","battery","low_battery","electric_plug","laptop","desktop_computer","printer","keyboard","computer_mouse","trackball","computer_disk","floppy_disk","optical_disk","dvd","abacus","movie_camera","film_frames","film_projector","clapper_board","television","camera","camera_with_flash","video_camera","videocassette","magnifying_glass_tilted_left","magnifying_glass_tilted_right","candle","light_bulb","flashlight","red_paper_lantern","diya_lamp","notebook_with_decorative_cover","closed_book","open_book","green_book","blue_book","orange_book","books","notebook","ledger","page_with_curl","scroll","page_facing_up","newspaper","rolled_up_newspaper","bookmark_tabs","bookmark","label","money_bag","coin","yen_banknote","dollar_banknote","euro_banknote","pound_banknote","money_with_wings","credit_card","receipt","chart_increasing_with_yen","envelope","e_mail","incoming_envelope","envelope_with_arrow","outbox_tray","inbox_tray","package","closed_mailbox_with_raised_flag","closed_mailbox_with_lowered_flag","open_mailbox_with_raised_flag","open_mailbox_with_lowered_flag","postbox","ballot_box_with_ballot","pencil","black_nib","fountain_pen","pen","paintbrush","crayon","memo","briefcase","file_folder","open_file_folder","card_index_dividers","calendar","tear_off_calendar","spiral_notepad","spiral_calendar","card_index","chart_increasing","chart_decreasing","bar_chart","clipboard","pushpin","round_pushpin","paperclip","linked_paperclips","straight_ruler","triangular_ruler","scissors","card_file_box","file_cabinet","wastebasket","locked","unlocked","locked_with_pen","locked_with_key","key","old_key","hammer","axe","pick","hammer_and_pick","hammer_and_wrench","dagger","crossed_swords","water_pistol","boomerang","bow_and_arrow","shield","carpentry_saw","wrench","screwdriver","nut_and_bolt","gear","clamp","balance_scale","white_cane","link","chains","hook","toolbox","magnet","ladder","alembic","test_tube","petri_dish","dna","microscope","telescope","satellite_antenna","syringe","drop_of_blood","pill","adhesive_bandage","crutch","stethoscope","x_ray","door","elevator","mirror","window","bed","couch_and_lamp","chair","toilet","plunger","shower","bathtub","mouse_trap","razor","lotion_bottle","safety_pin","broom","basket","roll_of_paper","bucket","soap","bubbles","toothbrush","sponge","fire_extinguisher","shopping_cart","cigarette","coffin","headstone","funeral_urn","moai","placard","identification_card"] },
  { id: 'travel', name: t('emoji.catTravel'), icon: Car, keys: ["globe_showing_europe_africa","globe_showing_americas","globe_showing_asia_australia","globe_with_meridians","world_map","map_of_japan","compass","snow_capped_mountain","mountain","volcano","mount_fuji","camping","beach_with_umbrella","desert","desert_island","national_park","stadium","classical_building","building_construction","brick","rock","wood","hut","houses","derelict_house","house","house_with_garden","office_building","japanese_post_office","post_office","hospital","bank","hotel","love_hotel","convenience_store","school","department_store","factory","japanese_castle","castle","wedding","tokyo_tower","statue_of_liberty","church","mosque","hindu_temple","synagogue","shinto_shrine","kaaba","fountain","tent","foggy","night_with_stars","cityscape","sunrise_over_mountains","sunrise","cityscape_at_dusk","sunset","bridge_at_night","hot_springs","carousel_horse","playground_slide","ferris_wheel","roller_coaster","barber_pole","circus_tent","locomotive","railway_car","high_speed_train","bullet_train","train","metro","light_rail","station","tram","monorail","mountain_railway","tram_car","bus","oncoming_bus","trolleybus","minibus","ambulance","fire_engine","police_car","oncoming_police_car","taxi","oncoming_taxi","automobile","oncoming_automobile","sport_utility_vehicle","pickup_truck","delivery_truck","articulated_lorry","tractor","racing_car","motorcycle","motor_scooter","manual_wheelchair","motorized_wheelchair","auto_rickshaw","bicycle","kick_scooter","skateboard","roller_skate","bus_stop","motorway","railway_track","oil_drum","fuel_pump","wheel","police_car_light","horizontal_traffic_light","vertical_traffic_light","stop_sign","construction","anchor","ring_buoy","sailboat","canoe","speedboat","passenger_ship","ferry","motor_boat","ship","airplane","small_airplane","airplane_departure","airplane_arrival","parachute","seat","helicopter","suspension_railway","mountain_cableway","aerial_tramway","satellite","rocket","flying_saucer","bellhop_bell","luggage","hourglass_done","hourglass_not_done","watch","alarm_clock","stopwatch","timer_clock","mantelpiece_clock","twelve_o_clock","twelve_thirty","one_o_clock","one_thirty","two_o_clock","two_thirty","three_o_clock","three_thirty","four_o_clock","four_thirty","five_o_clock","five_thirty","six_o_clock","six_thirty","seven_o_clock","seven_thirty","eight_o_clock","eight_thirty","nine_o_clock","nine_thirty","ten_o_clock","ten_thirty","eleven_o_clock","eleven_thirty","new_moon","waxing_crescent_moon","first_quarter_moon","waxing_gibbous_moon","full_moon","waning_gibbous_moon","last_quarter_moon","waning_crescent_moon","crescent_moon","new_moon_face","first_quarter_moon_face","last_quarter_moon_face","thermometer","sun","full_moon_face","sun_with_face","ringed_planet","star","glowing_star","shooting_star","milky_way","cloud","sun_behind_cloud","cloud_with_lightning_and_rain","sun_behind_small_cloud","sun_behind_large_cloud","sun_behind_rain_cloud","cloud_with_rain","cloud_with_snow","cloud_with_lightning","tornado","fog","wind_face","cyclone","rainbow","closed_umbrella","umbrella","umbrella_with_rain_drops","umbrella_on_ground","high_voltage","snowflake","snowman","snowman_without_snow","comet","fire","droplet","water_wave"] },
  { id: 'symbols', name: t('emoji.catSymbols'), icon: Hash, keys: ["red_hair","curly_hair","white_hair","bald","atm_sign","litter_in_bin_sign","potable_water","wheelchair_symbol","men_s_room","women_s_room","restroom","baby_symbol","water_closet","passport_control","customs","baggage_claim","left_luggage","warning","children_crossing","no_entry","prohibited","no_bicycles","no_smoking","no_littering","non_potable_water","no_pedestrians","no_mobile_phones","no_one_under_eighteen","radioactive","biohazard","up_arrow","up_right_arrow","right_arrow","down_right_arrow","down_arrow","down_left_arrow","left_arrow","up_left_arrow","up_down_arrow","left_right_arrow","right_arrow_curving_left","left_arrow_curving_right","right_arrow_curving_up","right_arrow_curving_down","clockwise_vertical_arrows","counterclockwise_arrows_button","back_arrow","end_arrow","on_arrow","soon_arrow","top_arrow","place_of_worship","atom_symbol","om","star_of_david","wheel_of_dharma","yin_yang","latin_cross","orthodox_cross","star_and_crescent","peace_symbol","menorah","dotted_six_pointed_star","aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces","ophiuchus","shuffle_tracks_button","repeat_button","repeat_single_button","play_button","fast_forward_button","next_track_button","play_or_pause_button","reverse_button","fast_reverse_button","last_track_button","upwards_button","fast_up_button","downwards_button","fast_down_button","pause_button","stop_button","record_button","eject_button","cinema","dim_button","bright_button","antenna_bars","vibration_mode","mobile_phone_off","female_sign","male_sign","transgender_symbol","multiply","plus","minus","divide","heavy_equals_sign","infinity","double_exclamation_mark","exclamation_question_mark","red_question_mark","white_question_mark","white_exclamation_mark","red_exclamation_mark","wavy_dash","currency_exchange","heavy_dollar_sign","medical_symbol","recycling_symbol","fleur_de_lis","trident_emblem","name_badge","japanese_symbol_for_beginner","hollow_red_circle","check_mark_button","check_box_with_check","check_mark","cross_mark","cross_mark_button","curly_loop","double_curly_loop","part_alternation_mark","eight_spoked_asterisk","eight_pointed_star","sparkle","copyright","registered","trade_mark","keycap","keycap_0","keycap_1","keycap_2","keycap_3","keycap_4","keycap_5","keycap_6","keycap_7","keycap_8","keycap_9","keycap_10","input_latin_uppercase","input_latin_lowercase","input_numbers","input_symbols","input_latin_letters","regional_indicator_a","regional_indicator_b","regional_indicator_c","regional_indicator_d","regional_indicator_e","regional_indicator_f","regional_indicator_g","regional_indicator_h","regional_indicator_i","regional_indicator_j","regional_indicator_k","regional_indicator_l","regional_indicator_m","regional_indicator_n","regional_indicator_o","regional_indicator_p","regional_indicator_q","regional_indicator_r","regional_indicator_s","regional_indicator_t","regional_indicator_u","regional_indicator_v","regional_indicator_w","regional_indicator_x","regional_indicator_y","regional_indicator_z","a_button_blood_type","ab_button_blood_type","b_button_blood_type","cl_button","cool_button","free_button","information","id_button","circled_m","new_button","ng_button","o_button_blood_type","ok_button","p_button","sos_button","up_button","vs_button","japanese_here_button","japanese_service_charge_button","japanese_monthly_amount_button","japanese_not_free_of_charge_button","japanese_reserved_button","japanese_bargain_button","japanese_discount_button","japanese_free_of_charge_button","japanese_prohibited_button","japanese_acceptable_button","japanese_application_button","japanese_passing_grade_button","japanese_vacancy_button","japanese_congratulations_button","japanese_secret_button","japanese_open_for_business_button","japanese_no_vacancy_button","red_circle","orange_circle","yellow_circle","green_circle","blue_circle","purple_circle","brown_circle","black_circle","white_circle","red_square","orange_square","yellow_square","green_square","blue_square","purple_square","brown_square","black_large_square","white_large_square","black_medium_square","white_medium_square","black_medium_small_square","white_medium_small_square","black_small_square","white_small_square","large_orange_diamond","large_blue_diamond","small_orange_diamond","small_blue_diamond","red_triangle_pointed_up","red_triangle_pointed_down","diamond_with_a_dot","radio_button","white_square_button","black_square_button"] },
  { id: 'flags', name: t('emoji.catFlags'), icon: Flag, keys: ["chequered_flag","triangular_flag","crossed_flags","black_flag","white_flag","flag_ascension_island","flag_andorra","flag_united_arab_emirates","flag_afghanistan","flag_antigua_barbuda","flag_anguilla","flag_albania","flag_armenia","flag_angola","flag_antarctica","flag_argentina","flag_american_samoa","flag_austria","flag_australia","flag_aruba","flag_land_islands","flag_azerbaijan","flag_bosnia_herzegovina","flag_barbados","flag_bangladesh","flag_belgium","flag_burkina_faso","flag_bulgaria","flag_bahrain","flag_burundi","flag_benin","flag_st_barth_lemy","flag_bermuda","flag_brunei","flag_bolivia","flag_caribbean_netherlands","flag_brazil","flag_bahamas","flag_bhutan","flag_bouvet_island","flag_botswana","flag_belarus","flag_belize","flag_canada","flag_cocos_keeling_islands","flag_congo_kinshasa","flag_central_african_republic","flag_congo_brazzaville","flag_switzerland","flag_c_te_d_ivoire","flag_cook_islands","flag_chile","flag_cameroon","flag_china","flag_colombia","flag_clipperton_island","flag_costa_rica","flag_cuba","flag_cape_verde","flag_cura_ao","flag_christmas_island","flag_cyprus","flag_czechia","flag_germany","flag_diego_garcia","flag_djibouti","flag_denmark","flag_dominica","flag_dominican_republic","flag_algeria","flag_ceuta_melilla","flag_ecuador","flag_estonia","flag_egypt","flag_western_sahara","flag_eritrea","flag_spain","flag_ethiopia","flag_european_union","flag_finland","flag_fiji","flag_falkland_islands","flag_micronesia","flag_faroe_islands","flag_france","flag_gabon","flag_united_kingdom","flag_grenada","flag_georgia","flag_french_guiana","flag_guernsey","flag_ghana","flag_gibraltar","flag_greenland","flag_gambia","flag_guinea","flag_guadeloupe","flag_equatorial_guinea","flag_greece","flag_south_georgia_south_sandwich_islands","flag_guatemala","flag_guam","flag_guinea_bissau","flag_guyana","flag_hong_kong_sar_china","flag_heard_mcdonald_islands","flag_honduras","flag_croatia","flag_haiti","flag_hungary","flag_canary_islands","flag_indonesia","flag_ireland","flag_israel","flag_isle_of_man","flag_india","flag_british_indian_ocean_territory","flag_iraq","flag_iran","flag_iceland","flag_italy","flag_jersey","flag_jamaica","flag_jordan","flag_japan","flag_kenya","flag_kyrgyzstan","flag_cambodia","flag_kiribati","flag_comoros","flag_st_kitts_nevis","flag_north_korea","flag_south_korea","flag_kuwait","flag_cayman_islands","flag_kazakhstan","flag_laos","flag_lebanon","flag_st_lucia","flag_liechtenstein","flag_sri_lanka","flag_liberia","flag_lesotho","flag_lithuania","flag_luxembourg","flag_latvia","flag_libya","flag_morocco","flag_monaco","flag_moldova","flag_montenegro","flag_st_martin","flag_madagascar","flag_marshall_islands","flag_north_macedonia","flag_mali","flag_myanmar_burma","flag_mongolia","flag_macao_sar_china","flag_northern_mariana_islands","flag_martinique","flag_mauritania","flag_montserrat","flag_malta","flag_mauritius","flag_maldives","flag_malawi","flag_mexico","flag_malaysia","flag_mozambique","flag_namibia","flag_new_caledonia","flag_niger","flag_norfolk_island","flag_nigeria","flag_nicaragua","flag_netherlands","flag_norway","flag_nepal","flag_nauru","flag_niue","flag_new_zealand","flag_oman","flag_panama","flag_peru","flag_french_polynesia","flag_papua_new_guinea","flag_philippines","flag_pakistan","flag_poland","flag_st_pierre_miquelon","flag_pitcairn_islands","flag_puerto_rico","flag_palestinian_territories","flag_portugal","flag_palau","flag_paraguay","flag_qatar","flag_r_union","flag_romania","flag_serbia","flag_russia","flag_rwanda","flag_saudi_arabia","flag_solomon_islands","flag_seychelles","flag_sudan","flag_sweden","flag_singapore","flag_st_helena","flag_slovenia","flag_svalbard_jan_mayen","flag_slovakia","flag_sierra_leone","flag_san_marino","flag_senegal","flag_somalia","flag_suriname","flag_south_sudan","flag_s_o_tom_pr_ncipe","flag_el_salvador","flag_sint_maarten","flag_syria","flag_eswatini","flag_tristan_da_cunha","flag_turks_caicos_islands","flag_chad","flag_french_southern_territories","flag_togo","flag_thailand","flag_tajikistan","flag_tokelau","flag_timor_leste","flag_turkmenistan","flag_tunisia","flag_tonga","flag_turkey","flag_trinidad_tobago","flag_tuvalu","flag_taiwan","flag_tanzania","flag_ukraine","flag_uganda","flag_u_s_outlying_islands","flag_united_nations","flag_united_states","flag_uruguay","flag_uzbekistan","flag_vatican_city","flag_st_vincent_grenadines","flag_venezuela","flag_british_virgin_islands","flag_u_s_virgin_islands","flag_vietnam","flag_vanuatu","flag_wallis_futuna","flag_samoa","flag_kosovo","flag_yemen","flag_mayotte","flag_south_africa","flag_zambia","flag_zimbabwe","flag_england","flag_scotland","flag_wales"] },
];

// スタンプ一覧は開くたびに取りに行かず、モジュールで持っておく（開いた瞬間に前回の分を出す）
let stampCache = null; // { stamps, genres }
let stampFetch = null;
function fetchStampList() {
  if (!stampFetch) {
    stampFetch = fetch('/api/stumps?t=' + Date.now())
      .then(res => res.json())
      .then(data => { stampCache = { stamps: data.stamps || [], genres: data.genres || [] }; return stampCache; })
      .finally(() => { stampFetch = null; });
  }
  return stampFetch;
}

// 先読み：よく使う絵文字・スマイル先頭の画像と、スタンプ一覧（ピッカーを開く前に呼ばれる）
let assetsPreloaded = false;
export function preloadEmojiAssets() {
  if (assetsPreloaded) return;
  assetsPreloaded = true;
  try {
    const keys = JSON.parse(localStorage.getItem('recent_emoji_keys') || '[]');
    const smileys = CATEGORIES[1]?.keys || [];
    const targets = new Set([...keys.slice(0, 32), ...smileys.slice(0, 32)]);
    for (const key of targets) {
      const e = EMOJI_MAP[key];
      if (e) { const img = new Image(); img.decoding = 'async'; img.src = getTwemojiUrl(e); }
    }
  } catch { /* 履歴が壊れていても無視 */ }
  fetchStampList().catch(() => {});
}

// 絵文字1マス。key が同じなら再描画しない
const EmojiCell = memo(function EmojiCell({ emojiKey, customMap, eager = false }) {
  const isCustom = typeof emojiKey === 'string' && emojiKey.startsWith(':') && emojiKey.endsWith(':');
  const custom = isCustom ? customMap?.get(emojiKey.slice(1, -1)) : null;
  const emoji = !isCustom ? EMOJI_MAP[emojiKey] : null;
  if (!emoji && !custom) return null;
  const src = custom ? custom.url : getTwemojiUrl(emoji);
  const title = isCustom ? emojiKey : `:${emojiKey}:`;
  return (
    <button
      data-key={emojiKey}
      title={title}
      className="w-full aspect-square flex items-center justify-center rounded-lg hover:bg-[var(--theme-option-bg)] transition-transform duration-100 hover:scale-110 active:scale-90 cursor-pointer p-1.5"
    >
      <img
        src={src}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className="w-full h-full object-contain pointer-events-none"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    </button>
  );
});

// カテゴリーのグリッド。最初の数行だけ即描画して、残りは次のフレーム以降に足す（開いた瞬間を軽く）
const FIRST_CHUNK = 48;
const EmojiGrid = memo(function EmojiGrid({ keys, customMap, onPick }) {
  const [count, setCount] = useState(() => Math.min(keys.length, FIRST_CHUNK));
  useEffect(() => {
    if (count >= keys.length) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => setCount(c => Math.min(keys.length, c + 120)));
    return () => cancel(id);
  }, [count, keys.length]);
  return (
    <div
      className="grid grid-cols-8 gap-0.5 px-1.5"
      onClick={(e) => {
        const btn = e.target.closest('button[data-key]');
        if (btn) onPick(btn.dataset.key);
      }}
    >
      {keys.slice(0, count).map((key, idx) => <EmojiCell key={key} emojiKey={key} customMap={customMap} eager={idx < FIRST_CHUNK} />)}
    </div>
  );
});

const EmojiPicker = memo(function EmojiPicker({ onSelect, disableGif = false, socket = null, isOpen = true }) {
  const customEmojis = useCustomEmojis(socket);
  const customMap = useMemo(() => {
    const m = new Map();
    for (const ce of customEmojis) m.set(ce.name, ce);
    return m;
  }, [customEmojis]);
  const customKeys = useMemo(() => customEmojis.map(ce => `:${ce.name}:`), [customEmojis]);
  const randomCustomEmoji = useMemo(() => {
    if (customEmojis.length === 0) return null;
    return customEmojis[Math.floor(Math.random() * customEmojis.length)];
  }, [customEmojis]);
  const [recentKeys, setRecentKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recent_emoji_keys') || '[]'); } catch { return []; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const { gifEnabled } = useServerConfig(); // サーバーに KLIPY_API がないときは GIF タブを出さない
  const [modeState, setMode] = useState('emoji'); // 'emoji', 'stamp', or 'gif'
  const mode = modeState === 'gif' && !gifEnabled ? 'emoji' : modeState;
  const [activeCategory, setActiveCategory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('recent_emoji_keys') || '[]');
      return saved.length > 0 ? 'recent' : 'smileys';
    } catch {
      return 'smileys';
    }
  });
  const [gifs, setGifs] = useState([]);
  const [nextPos, setNextPos] = useState('');
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  
  // Stamp state
  const [stamps, setStamps] = useState(() => stampCache?.stamps || []);
  const [stampGenres, setStampGenres] = useState(() => stampCache?.genres || []);
  const [activeStampGenre, setActiveStampGenre] = useState('all');
  const [recentStamps, setRecentStamps] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hc_recent_stamps') || '[]'); } catch { return []; }
  });
  const [isLoadingStamps, setIsLoadingStamps] = useState(false);

  const gifScrollRef = useRef(null);
  const categoryRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const jumpingUntilRef = useRef(0);

  // 保持マウント時に再度開かれたら最新の履歴を反映
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = JSON.parse(localStorage.getItem('recent_emoji_keys') || '[]');
      setRecentKeys(prev => (prev.length === saved.length && prev.every((k, i) => k === saved[i])) ? prev : saved);
    } catch { /* ignore */ }
  }, [isOpen]);

  // Fetch stamps from server
  const fetchStamps = (showLoader = true) => {
    if (showLoader) setIsLoadingStamps(true);
    fetchStampList()
      .then(data => {
        setStamps(data.stamps);
        setStampGenres(data.genres);
      })
      .catch(err => console.error('Failed to load stamps:', err))
      .finally(() => { if (showLoader) setIsLoadingStamps(false); });
  };

  useEffect(() => {
    if (!stampCache) fetchStamps(false); // バックグラウンドで静かに取得（不要な loading 再描画を防ぐ）
    if (socket) {
      const handleUpdate = () => fetchStamps(false);
      socket.on('stamps_updated', handleUpdate);
      return () => socket.off('stamps_updated', handleUpdate);
    }
  }, [socket]);

  useEffect(() => {
    if (mode === 'stamp' && stamps.length === 0) {
      fetchStamps(true);
    }
  }, [mode]);

  const handleStampSelect = (stamp) => {
    onSelect({ type: 'stamp', url: stamp.url, name: stamp.name, genre: stamp.genre });
    const updated = [stamp, ...recentStamps.filter(s => s.url !== stamp.url)].slice(0, 16);
    setRecentStamps(updated);
    localStorage.setItem('hc_recent_stamps', JSON.stringify(updated));
  };

  useEffect(() => {
    if (mode === 'gif') {
      setIsLoadingGifs(true);
      const endpoint = searchQuery.trim()
        ? `/api/gifs?query=${encodeURIComponent(searchQuery)}&limit=20`
        : `/api/gifs?limit=20`;
      
      let isMounted = true;
      api.get(endpoint)
        .then(data => {
          if (isMounted && data.results) {
            setGifs(data.results.map(g => ({
              id: g.id,
              url: g.media_formats?.nanogif?.url || g.media_formats?.tinygif?.url || g.media_formats?.gif?.url
            })));
            setNextPos(data.next || '');
            if (gifScrollRef.current) {
              gifScrollRef.current.scrollTop = 0;
            }
          }
        }).catch(err => console.error(err))
        .finally(() => { if (isMounted) setIsLoadingGifs(false); });
      return () => { isMounted = false; };
    }
  }, [mode, searchQuery]);

  const loadMoreGifs = () => {
    if (isLoadingGifs || !nextPos) return;
    setIsLoadingGifs(true);
    const endpoint = searchQuery.trim()
      ? `/api/gifs?query=${encodeURIComponent(searchQuery)}&limit=20&pos=${nextPos}`
      : `/api/gifs?limit=20&pos=${nextPos}`;
    
    api.get(endpoint)
      .then(data => {
        if (data.results) {
          setGifs(prev => {
            const newGifs = data.results.map(g => ({
              id: g.id,
              url: g.media_formats?.nanogif?.url || g.media_formats?.tinygif?.url || g.media_formats?.gif?.url
            }));
            const existingIds = new Set(prev.map(g => g.id));
            return [...prev, ...newGifs.filter(g => !existingIds.has(g.id))];
          });
          setNextPos(data.next || '');
        }
      }).catch(err => console.error(err))
      .finally(() => setIsLoadingGifs(false));
  };

  const handleGifScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMoreGifs();
    }
  };


  const onSelectRef = useRef(onSelect);
  const recentRef = useRef(recentKeys);
  // 描画中に ref を書き換えない（react-hooks/refs）。クリックは描画後なので effect で十分
  useEffect(() => {
    onSelectRef.current = onSelect;
    recentRef.current = recentKeys;
  });

  // 参照が変わらないので EmojiGrid が再描画されない
  const [handleEmojiSelect] = useState(() => (key) => {
    if (typeof key === 'string' && key.startsWith(':') && key.endsWith(':')) {
      onSelectRef.current(key);
      const updated = [key, ...recentRef.current.filter(k => k !== key)].slice(0, 32);
      localStorage.setItem('recent_emoji_keys', JSON.stringify(updated));
      return;
    }

    let emoji = EMOJI_MAP[key];
    if (!emoji) return;

    if (key.startsWith('regional_indicator_')) {
      emoji += '\u200B';
    }

    onSelectRef.current(emoji);

    const updated = [key, ...recentRef.current.filter(k => k !== key)].slice(0, 32);
    localStorage.setItem('recent_emoji_keys', JSON.stringify(updated));
  });

  const scrollToCategory = (id) => {
    setActiveCategory(id);
    jumpingUntilRef.current = Date.now() + 450;
    const doScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      if (id === 'recent') {
        container.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const element = categoryRefs.current[id];
      if (element) {
        container.scrollTo({ top: element.offsetTop, behavior: 'smooth' });
      }
    };
    if (searchQuery) {
      setSearchQuery('');
      requestAnimationFrame(doScroll);
    } else {
      doScroll();
    }
  };

  const handleEmojiScroll = (e) => {
    if (Date.now() < jumpingUntilRef.current || filteredResults) return;
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const threshold = scrollTop + 44;
    let current = recentKeys.length > 0 ? 'recent' : 'smileys';
    for (const cat of CATEGORIES) {
      if (cat.id === 'recent' && recentKeys.length === 0) continue;
      const el = categoryRefs.current[cat.id];
      if (el && el.offsetTop <= threshold) {
        current = cat.id;
      }
    }
    setActiveCategory(prev => (prev === current ? prev : current));
  };

  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/:/g, '');
    if (!q) return null;
    const matchedCustom = customEmojis
      .filter(ce => ce.name.toLowerCase().includes(q))
      .map(ce => `:${ce.name}:`);
    const matchedStd = Object.keys(EMOJI_MAP).filter(key => key.toLowerCase().includes(q));
    return [...matchedCustom, ...matchedStd].slice(0, 80);
  }, [searchQuery, customEmojis]);

  const filteredStamps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stamps.filter(s => {
      const matchGenre = activeStampGenre === 'all' || s.genre === activeStampGenre;
      const matchQuery = !q || s.name.toLowerCase().includes(q) || s.genre.toLowerCase().includes(q);
      return matchGenre && matchQuery;
    });
  }, [stamps, activeStampGenre, searchQuery]);

  const pickerTabs = [
    { id: 'emoji', label: 'Emoji', icon: Smile },
    { id: 'stamp', label: t('emoji.stamps'), icon: Sticker },
    ...(gifEnabled ? [{ id: 'gif', label: 'GIF', icon: ImageIcon }] : []),
  ];

  return (
    <div className="w-[380px] h-[460px] bg-[var(--theme-secondary)] text-[var(--theme-text)] border border-[var(--border-chat)] rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[100]">
      <div className="relative z-20 flex flex-col bg-[var(--theme-secondary)] border-b border-[var(--border-chat)] shrink-0">
        {!disableGif && (
          <div className="relative flex border-b border-[var(--border-chat)]">
            {/* 下線は1本だけ。選択位置へすっと移動する */}
            <span
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] px-3 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${100 / pickerTabs.length}%`, transform: `translateX(${Math.max(0, pickerTabs.findIndex(t => t.id === mode)) * 100}%)` }}
            >
              <span className="block h-full w-full rounded-full bg-[var(--theme-accent)]" />
            </span>
            {pickerTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setMode(tab.id); setSearchQuery(''); }}
                  className={`relative flex-1 flex items-center justify-center gap-2 h-10 text-[13px] font-bold transition-colors ${
                    isActive
                      ? 'text-[var(--theme-text)]'
                      : 'text-[var(--theme-text-subtle)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-option-bg)]/50'
                  }`}
                >
                  <Icon size={16} /> {tab.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative flex items-center bg-[var(--theme-secondary)] px-4 py-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={mode === 'emoji' ? t('emoji.searchEmoji') : mode === 'stamp' ? t('emoji.searchStamps') : t('emoji.searchGifs')}
            className="flex-1 bg-transparent border-none outline-none text-[var(--theme-text)] placeholder:text-[var(--theme-text-subtle)] text-[13px] font-medium"
          />
          <Search size={16} className="text-[var(--theme-text-subtle)]" />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {mode === 'emoji' ? (
          <>
            <div className="w-[52px] bg-[var(--bg-channel)] flex flex-col items-center justify-evenly py-2 border-r border-[var(--border-channel)] relative z-30 shrink-0">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = !filteredResults && activeCategory === cat.id;
                return (
                  <div key={cat.id} className="relative group/cat flex items-center justify-center w-full">
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-r-full bg-[var(--theme-text-muted)]" />
                    )}
                    <button
                      type="button"
                      onClick={() => scrollToCategory(cat.id)}
                      title={cat.name}
                      aria-label={cat.name}
                      aria-pressed={isActive}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-90 ${
                        isActive
                          ? 'bg-[var(--theme-option-bg)] text-[var(--theme-text)]'
                          : 'text-[var(--theme-text-subtle)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-option-bg)]/50'
                      }`}
                    >
                      {cat.id === 'custom' ? (
                        randomCustomEmoji ? (
                          <img
                            src={randomCustomEmoji.url}
                            alt=""
                            className="w-5 h-5 object-contain shrink-0 pointer-events-none"
                          />
                        ) : (
                          <span className="w-[18px] h-[18px] rounded-full bg-black shrink-0 inline-block" />
                        )
                      ) : (
                        <Icon size={19} strokeWidth={isActive ? 2.25 : 1.9} className="shrink-0" />
                      )}
                    </button>
                    <div className="pointer-events-none opacity-0 group-hover/cat:opacity-100 transition-opacity duration-150 absolute left-[calc(100%+6px)] top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg bg-[var(--theme-primary)] text-[var(--theme-text)] text-[11px] font-bold shadow-lg border border-[var(--border-chat)] z-50">
                      {cat.name}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 relative overflow-hidden bg-[var(--theme-secondary)]">
            <div ref={scrollContainerRef} onScroll={handleEmojiScroll} className="h-full overflow-y-auto custom-scrollbar bg-[var(--theme-secondary)] relative">
              {filteredResults ? (
                <div className="pb-2">
                  <div className="flex items-center justify-between text-[11px] font-bold tracking-wide text-[var(--theme-text-muted)] px-3 pt-2.5 pb-2 sticky top-0 bg-[var(--theme-secondary)]/95 backdrop-blur-sm z-10 border-b border-[var(--border-chat)] mb-1">
                    <span>{t('common.searchResults')}</span>
                    <span className="text-[10px] font-semibold text-[var(--theme-text-subtle)]">{t('emoji.resultCount', { count: filteredResults.length })}</span>
                  </div>
                  {filteredResults.length > 0
                    ? <EmojiGrid key={searchQuery} keys={filteredResults} customMap={customMap} onPick={handleEmojiSelect} />
                    : <div className="text-[var(--theme-text-subtle)] text-[12px] font-medium text-center py-8">{t('common.notFound')}</div>}
                </div>
              ) : (
                <div className="pb-3">
                  {recentKeys.length > 0 && (
                    <section
                      ref={(el) => { categoryRefs.current['recent'] = el; }}
                      className="pb-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold tracking-wide text-[var(--theme-text-muted)] px-3 sticky top-0 bg-[var(--theme-secondary)]/95 backdrop-blur-sm py-2 z-10 border-b border-[var(--border-chat)] mb-1">
                        <span className="flex items-center gap-1.5"><Clock size={13} className="text-[var(--theme-text-subtle)]" /> {t('emoji.frequent')}</span>
                        <span className="text-[10px] font-semibold text-[var(--theme-text-subtle)]">{recentKeys.length}</span>
                      </div>
                      <EmojiGrid keys={recentKeys} customMap={customMap} onPick={handleEmojiSelect} />
                    </section>
                  )}

                  <section
                    ref={(el) => { categoryRefs.current['custom'] = el; }}
                    className="pb-2"
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold tracking-wide text-[var(--theme-text-muted)] px-3 sticky top-0 bg-[var(--theme-secondary)]/95 backdrop-blur-sm py-2 z-10 border-b border-[var(--border-chat)] mb-1">
                      <span className="flex items-center gap-1.5">
                        {randomCustomEmoji ? (
                          <img src={randomCustomEmoji.url} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-black shrink-0 inline-block" />
                        )}
                        {t('emoji.custom')}
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--theme-text-subtle)]">{customKeys.length}</span>
                    </div>
                    {customKeys.length > 0 ? (
                      <EmojiGrid keys={customKeys} customMap={customMap} onPick={handleEmojiSelect} />
                    ) : (
                      <div className="py-4 px-3 text-center text-[11.5px] text-[var(--theme-text-subtle)]">
                        {t('emoji.customHint')}
                      </div>
                    )}
                  </section>

                  {CATEGORIES.slice(2).map((cat) => {
                    const CatIcon = cat.icon;
                    const estimatedH = Math.ceil(cat.keys.length / 8) * 38 + 44;
                    return (
                      <section
                        key={cat.id}
                        ref={(el) => { categoryRefs.current[cat.id] = el; }}
                        style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${estimatedH}px` }}
                        className="pb-2"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold tracking-wide text-[var(--theme-text-muted)] px-3 sticky top-0 bg-[var(--theme-secondary)]/95 backdrop-blur-sm py-2 z-10 border-b border-[var(--border-chat)] mb-1">
                          <span className="flex items-center gap-1.5"><CatIcon size={13} className="text-[var(--theme-text-subtle)]" /> {cat.name}</span>
                          <span className="text-[10px] font-semibold text-[var(--theme-text-subtle)]">{cat.keys.length}</span>
                        </div>
                        <EmojiGrid keys={cat.keys} customMap={customMap} onPick={handleEmojiSelect} />
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </>
        ) : mode === 'stamp' ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--theme-background)] relative">
            {stampGenres.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--theme-secondary)] border-b border-[var(--border-chat)] overflow-x-auto no-scrollbar shrink-0">
                <button
                  onClick={() => setActiveStampGenre('all')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                    activeStampGenre === 'all'
                      ? 'bg-[var(--theme-option-hover-bg)] text-[var(--theme-text)]'
                      : 'bg-[var(--theme-option-bg)]/60 text-[var(--theme-text-muted)] hover:bg-[var(--theme-option-bg)]'
                  }`}
                >
                  {t('emoji.allCount', { count: stamps.length })}
                </button>
                {stampGenres.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setActiveStampGenre(g.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                      activeStampGenre === g.id
                        ? 'bg-[var(--theme-option-hover-bg)] text-[var(--theme-text)]'
                        : 'bg-[var(--theme-option-bg)]/60 text-[var(--theme-text-muted)] hover:bg-[var(--theme-option-bg)]'
                    }`}
                  >
                    {g.name} ({g.stamps.length})
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {recentStamps.length > 0 && !searchQuery.trim() && activeStampGenre === 'all' && (
                <div className="mb-4">
                  <div className="text-[10px] font-bold tracking-widest text-[var(--theme-text-subtle)] uppercase mb-2 px-1 sticky top-0 bg-[var(--theme-background)]/95 backdrop-blur-sm py-1 z-10">{t('emoji.frequentStamps')}</div>
                  <div className="grid grid-cols-4 gap-3">
                    {recentStamps.map((stamp, idx) => (
                      <button
                        key={`recent-${idx}`}
                        onClick={() => handleStampSelect(stamp)}
                        className="group relative bg-[var(--theme-secondary)] border border-[var(--border-chat)] hover:border-[var(--theme-accent)]/50 hover:shadow-md rounded-xl p-2 flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 aspect-square"
                      >
                        <img src={stamp.url} alt={stamp.name} loading="lazy" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200" />
                        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-[var(--theme-primary)] text-[var(--theme-text)] border border-[var(--border-chat)] text-[10px] px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 whitespace-nowrap">{stamp.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] font-bold tracking-widest text-[var(--theme-text-subtle)] uppercase mb-2 px-1 sticky top-0 bg-[var(--theme-background)]/95 backdrop-blur-sm py-1 z-10">
                {searchQuery ? t('common.searchResults') : activeStampGenre === 'all' ? t('emoji.allStamps') : t('emoji.genreStamps', { activeStampGenre })}
              </div>

              {isLoadingStamps && stamps.length === 0 ? (
                <div className="text-center py-12 text-[var(--theme-text-subtle)] text-xs font-medium">
                  {t('emoji.loadingStamps')}
                </div>
              ) : filteredStamps.length > 0 ? (
                <div className="grid grid-cols-4 gap-3 pb-2">
                  {filteredStamps.map(stamp => (
                    <button
                      key={stamp.id || stamp.url}
                      onClick={() => handleStampSelect(stamp)}
                      className="group relative bg-[var(--theme-secondary)] border border-[var(--border-chat)] hover:border-[var(--theme-accent)]/50 hover:shadow-md rounded-xl p-2 flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 aspect-square"
                    >
                      <img src={stamp.url} alt={stamp.name} loading="lazy" className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-200" />
                      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-[var(--theme-primary)] text-[var(--theme-text)] border border-[var(--border-chat)] text-[10px] px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 whitespace-nowrap">{stamp.name} ({stamp.genre})</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--theme-text-subtle)] text-xs font-medium">
                  {t('emoji.noStamps')}
                  <p className="text-[11px] opacity-70 mt-1">{t('emoji.noStampsHint')}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div ref={gifScrollRef} onScroll={handleGifScroll} className="flex-1 overflow-y-auto p-2 scroll-smooth custom-scrollbar bg-[var(--theme-background)] relative h-full">
            <div className="grid grid-cols-2 gap-2 pb-2">
              {gifs.map(gif => (
                <button
                  key={gif.id}
                  onClick={() => onSelect({ type: 'gif', url: gif.url })}
                  className="rounded-md overflow-hidden border border-[var(--border-chat)] hover:border-[var(--theme-accent)]/50 hover:shadow-md transition-all group focus:outline-none"
                >
                  <img src={gif.url} alt="GIF" loading="lazy" decoding="async" className="w-full h-[150px] object-cover bg-[var(--theme-option-bg)] group-hover:scale-105 transition-transform duration-300" />
                </button>
              ))}
              {gifs.length === 0 && isLoadingGifs && (
                <div className="col-span-2 text-[var(--theme-text-subtle)] text-[12px] font-medium text-center py-6">
                  {t('emoji.loadingGifs')}
                </div>
              )}
              {gifs.length > 0 && isLoadingGifs && (
                <div className="col-span-2 text-zinc-900/30 text-[12px] font-medium text-center py-4">
                  {t('emoji.loadingMore')}
                </div>
              )}
            </div>
            <div className="absolute bottom-1 right-2 text-[10px] text-zinc-900/20 font-bold pointer-events-none z-20">Powered by Klipy</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default EmojiPicker;
