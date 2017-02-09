
// Change this to the minified json of the desired stats
var desiredStats = [
	{
		"type": "INT",
		"name": "player_time",
		"display": {
			"name": "player_time"
		},
		"min": "0",
		"default": "0",
		"permission": 0
	},
	{
		"type": "INT",
		"name": "stat_8",
		"permission": 0
	}
];

// Internal variables
var appId = g_AppId; // Payday 2: 218620 / Payday 2 Test: 412890
var baseUrl = g_szBaseURL; // "https://partner.steamgames.com/apps";
var existingStats = null;
var currentStatIdx = -1; // Start on -1 since we increment this to 0 at the beginning

var count = {
	created: 0,
	updated: 0,
	skipped: 0,
	errors: 0,
};

//------------------------------------------------------------------------------
// Main Script
//------------------------------------------------------------------------------

// Main function, runs the script
function main()
{
	// Fetch all stats that exist already
	var fetchAllUrl = baseUrl + "/apps/fetchstats/" + appId;
	console.log("Fetching all stats...");
	AppsAjaxRequest(fetchAllUrl, {}, function(results){
		console.log("Retrieved results!");
		existingStats = results;
		ParseExistingStats();
	});
}

function ParseExistingStats()
{

	console.log("Parsing existing stats...");

	// Check if we got any stats before continuing
	if (!existingStats) {
		console.error("Existing stats do not exist, exiting!");		
		return;
	}

	// Check if any desired stats already exist and should have their id's updated so we don't change the id's on the server unnecessarily
	for (var i = 0; i < existingStats.length; i++)
	{
		for (var k = 0; k < desiredStats.length; k++)
		{
			if (existingStats[i].name === desiredStats[k].name && existingStats[i].stat_id != desiredStats[k].stat_id)
			{
				desiredStats[k].stat_id = existingStats[i].stat_id;
				desiredStats[k].exists_on_server = true;
				console.log("Desired stat " + desiredStats[k].name + " is using a different id, changed to existing id: " + desiredStats[k].stat_id);
			}
		}
	}

	// Check if any desired stats have id clashes and fix them
	for (var i = 0; i < desiredStats.length; i++)
	{
		for (var k = 0; k < desiredStats.length; k++)
		{
			if (i != k && desiredStats[i].stat_id === desiredStats[k].stat_id)
			{
				console.log("Found stat id clash on " + desiredStats[i].name + " and " + desiredStats[k].name + ", reassigning...");
				if(!("exists_on_server" in desiredStats[i]))
				{
					desiredStats[i].stat_id = GetNewIdForStat();
					console.log("Reassigned stat for " + desiredStats[i].name + " to: " + desiredStats[i].stat_id);
				}
				else if(!("exists_on_server" in desiredStats[k]))
				{
					desiredStats[k].stat_id = GetNewIdForStat();
					console.log("Reassigned stat for " + desiredStats[k].name + " to: " + desiredStats[k].stat_id);
				}
				else
				{
					console.error("Could not resolve id clash as both are sharing the same id on the server! Quitting...");
					count.errors++;
					Finalize();
					return;
				}
			}
		}
	}

	// Start updating stats
	CreateOrUpdateNextStat();

}

function CreateOrUpdateNextStat()
{

	// Increment stat being updated
	currentStatIdx++;
	var stat = desiredStats[ currentStatIdx ];

	// Check if stat exists or if we hit the end
	if(stat === undefined)
	{
		Finalize();
		return;
	}

	// console.log("Checking stat: " + stat.name + " (" + stat.stat_id + ")");

	// Check if the stat downloaded an id or if it needs to create one
	if("stat_id" in stat)
	{

		// Stat exists, so fetch it's data and update it
		var fetchUrl = baseUrl + "/apps/fetchstat/" + appId + "/" + stat.stat_id;

		AppsAjaxRequest( fetchUrl, {}, function(results){
			if( CheckIfStatExists(results) )
			{
				UpdateStat( stat, results );
			}
			else 
			{
				CreateStat( stat );
			}
		});

	}
	else
	{
		// Stat doesn't exist so create it
		CreateStat( stat );
	}

}

function CreateStat( stat )
{
	console.log("Creating new stat " + stat.name);

	// Create the stat
	AppsAjaxRequest( baseUrl + '/apps/newstat/' + appId,
		{
			'maxstatid' : $('max_statid_used').innerHTML
		},
		function( results )
		{
			$('max_statid_used').innerHTML = results[ 'maxstatid' ];
			if( results[ 'stat' ] )
			{
				count.created++;
				stat.stat_id = results[ 'stat' ].stat_id;
				console.log("Created stat " + stat.name + " (" + stat.stat_id + ") ...");
				UpdateStat( stat, results[ 'stat' ] );
			}
			else
			{
				count.errors++;
				console.error("Could not create stat for " + stat.name + "!");
				CreateOrUpdateNextStat();
			}
		}
	);
}

function UpdateStat( stat, results )
{
	console.log("Checking if need to update stat " + stat.name + " (" + stat.stat_id + ") ...");
	var result = AreStatsEqual(stat, results);
	if(result && result.equal)
	{
		// Ignore this one, and continue updating stats
		count.skipped++;
		console.log("Skipping...");
		CreateOrUpdateNextStat();
	}
	else
	{
		// Stat needs updating, so send new information
		console.log("Updating...");

		AppsAjaxRequest( baseUrl + "/apps/savestat/" + appId,
			{
				'statid' : stat.stat_id,
				'stattype' : GetStatValue(stat, "type", "INT"),
				'apiname' : GetStatValue(stat, "name", "stat_" + stat.stat_id),
				'permission' : GetStatValue(stat, "permission", 0),
				'incrementonly' : GetStatValue(stat, "incrementonly", false),
				'maxchange' : GetStatValue(stat, "maxchange", undefined),
				'min' : GetStatValue(stat, "min", undefined),
				'max' : GetStatValue(stat, "max", undefined),
				'windowsize' : GetStatValue(stat, "windowsize", undefined),
				'default' : GetStatValue(stat, "default", undefined),
				'aggregated' : GetStatValue(stat, "aggregated", false),
				'displayname' : GetStatDisplayValue(stat, "name", "")
			},
			function( results )
			{
				if (results['saved'])
				{
					count.updated++;
					console.log("Successfully updated stat " + stat.name + " (" + stat.stat_id + ")!");
				}
				else
				{
					count.errors++;
					console.error("Failed to update stat " + stat.name + " (" + stat.stat_id + ")!");
				}
				CreateOrUpdateNextStat();
			},
			'post'
		);

	}

}

function Finalize()
{
	if(count.errors == 0)
	{
		console.info("Completed, all stats successfully updated!");
	}
	else
	{
		console.warn("Completed, but some errors were encountered. Please check the error log and refresh the page!");
	}
	console.info(count.created + " stats created\n" + count.updated + " stats updated\n" + count.skipped + " stats skipped");
}

//------------------------------------------------------------------------------
// Helper Functions
//------------------------------------------------------------------------------

// Checks if a particular stat exists
function CheckIfStatExists( results )
{
	var doesnt_exist = (results === "gameplay stat not found");
	if(doesnt_exist)
	{
		return false;
	}
	else
	{
		return true;
	}
}

// Gets the first available unused id
function GetNewIdForStat()
{
	var maxId = 0;
	for (var i = 0; i < existingStats.length; i++)
	{
		maxId = Math.max( existingStats[i].stat_id, maxId );
	}
	for (var i = 0; i < desiredStats.length; i++)
	{
		maxId = Math.max( desiredStats[i].stat_id, maxId );
	}
	return maxId + 1;
}

// Checks if the object on the server and the local object are the same and don't need updating
function AreStatsEqual( local, server )
{
	if (!IsStatEqual( local, server, "type" ))
		return { equal: false, reason: "type" };
	if (!IsStatEqual( local, server, "name" ))
		return { equal: false, reason: "name" };
	if (!IsStatEqual( local, server, "permission" ))
		return { equal: false, reason: "permission" };
	if (!IsStatEqual( local, server, "incrementonly" ))
		return { equal: false, reason: "incrementonly" };
	if (!IsStatEqual( local, server, "maxchange" ))
		return { equal: false, reason: "maxchange" };
	if (!IsStatEqual( local, server, "min" ))
		return { equal: false, reason: "min" };
	if (!IsStatEqual( local, server, "max" ))
		return { equal: false, reason: "max" };
	if (!IsStatEqual( local, server, "windowsize" ))
		return { equal: false, reason: "windowsize" };
	if (!IsStatEqual( local, server, "default" ))
		return { equal: false, reason: "default" };
	if (!IsStatEqual( local, server, "aggregated" ))
		return { equal: false, reason: "aggregated" };
	if ( ("display" in local) && ("display" in server) )
	{
		if (!IsStatEqual( local["display"], server["display"], "name" ))
			return { equal: false, reason: "displayname" };
	}

	return { equal: true };

}

function IsStatEqual( local, server, stat_name )
{
	if( (stat_name in local) != (stat_name in server) )
		return false;
	if( local[stat_name] != server[stat_name] )
		return false;
	return true;
}

// Get the value of a stat, or a default if it is not set
function GetStatValue( stat, name, def )
{
	if ( name in stat )
	{
		return stat[name];
	}
	else
	{
		return def;
	}
}

function GetStatDisplayValue( stat, name, def )
{
	if ( "display" in stat && name in stat["display"] )
	{
		return stat["display"][name];
	}
	else
	{
		return def;
	}
}

//------------------------------------------------------------------------------

// Run the script
main();
